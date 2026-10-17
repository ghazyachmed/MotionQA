// Derives every number the video shows from machine output and checks src/data/verified-results.json against it.
//
//   node scripts/verify-results.mjs           check (default; exit 1 on any mismatch)
//   node scripts/verify-results.mjs --write   regenerate src/data/verified-results.json from the sources
//
// Order of evidence: evaluation JSON and split manifest, then footage sidecars (API responses recorded during
// capture), then the AWS deployment record (Markdown, parsed for three figures). Proposal text is never a source.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(videoRoot, "..");
const outFile = path.join(videoRoot, "src", "data", "verified-results.json");
const write = process.argv.includes("--write");
const failures = [];
const fail = (message) => failures.push(message);

const sources = {
  results: "evaluation/results/visaPcb1Results.json",
  policy1: "evaluation/results/history/visaPcb1Results-run3-policy1.json",
  failureAnalysis: "evaluation/results/failureAnalysis-2026-10-16.json",
  split: "evaluation/visaPcb1Split.json",
  policy1Profile: "evaluation/policies/visaPcb1-policy1-profile.json",
  run1: "evaluation/results/history/visaPcb1Results-run1-wholePartGates.json",
  run2: "evaluation/results/history/visaPcb1Results-run2-tileMedianGates.json",
  evaluationDoc: "docs/EVALUATION.md",
  awsRecord: "evaluation/aws-2026-10-16/README.md",
};

const readText = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const readJson = (rel) => JSON.parse(readText(rel));
const sha256 = (abs) => createHash("sha256").update(fs.readFileSync(abs)).digest("hex");

for (const rel of Object.values(sources)) {
  if (!fs.existsSync(path.join(repoRoot, rel))) fail(`missing source ${rel}`);
}
if (failures.length) finish();

const results = readJson(sources.results);
const policy1 = readJson(sources.policy1);
const failureAnalysis = readJson(sources.failureAnalysis);
const split = readJson(sources.split);
const awsText = readText(sources.awsRecord);
const policy1Profile = readJson(sources.policy1Profile);
const overlap048 = failureAnalysis.groundTruthOverlap.find((item) => item.image === "Anomaly/048");
const overlap000 = failureAnalysis.groundTruthOverlap.find((item) => item.image === "Anomaly/000");
const run1 = readJson(sources.run1);
const run2 = readJson(sources.run2);
const evaluationDoc = readText(sources.evaluationDoc);
const archiveBytesMatch = evaluationDoc.match(/\| Size \/ SHA-256 \| ([\d,]+) bytes/);
if (!archiveBytesMatch) fail("docs/EVALUATION.md: archive size not found");
const stagesPath = path.join(videoRoot, "src", "data", "pipeline-stages.json");
const pipelineStages = fs.existsSync(stagesPath) ? JSON.parse(fs.readFileSync(stagesPath, "utf8")) : null;

const frac = (n, d) => ({ n, d });
const sumDecisions = (block, key) => block.anomaly.decisions[key] + block.normal.decisions[key];
const testCount = results.test.decisions.anomaly.count + results.test.decisions.normal.count;
const record = (data, name) => data.records.test.find((r) => r.image.endsWith(name));
const pick = (r) => (r ? { image: r.image, defectType: r.defectType, decision: r.decision, reasonCode: r.reasonCode, anomalyScore: Number(r.anomalyScore.toFixed(3)), identityDistance: Number(r.identityDistance.toFixed(4)) } : null);

function automatic(block) {
  return sumDecisions(block, "PASS") + sumDecisions(block, "FAIL");
}

// AWS record figures: parsed, never typed in by hand.
function awsFigure(pattern, label) {
  const match = awsText.match(pattern);
  if (!match) {
    fail(`AWS record: could not find ${label}`);
    return null;
  }
  return match.slice(1);
}
const awsDecisions = awsFigure(/(\d+) PASS, (\d+) REVIEW, (\d+) FAIL\s+—\s+\*\*(\d+)\/(\d+) identical/, "decision match");
const awsInference = awsFigure(/Inference \(`t4g\.small`, 2 vCPU\) \| median \*\*(\d+) ms\*\*/, "inference median");
const awsServer = awsFigure(/Server total[^|]*\| median \*\*([\d,]+) ms\*\*/, "server median");
const awsStack = awsFigure(/\| Stack \| ([\d:]+) \| \*\*CREATE_COMPLETE\*\*/, "stack complete time");

// Local demonstration results come from the API responses stored next to each clip.
const footageDir = path.join(videoRoot, "public", "assets", "footage");
const clipNames = ["local-01-pass", "local-02-fail", "local-03-review", "local-04-missed-048", "local-05-identity-043", "local-06-retake-session", "aws-01-ui-status", "aws-02-model-status", "aws-03-health"];
const footage = {};
for (const name of clipNames) {
  const sidecarPath = path.join(footageDir, `${name}.json`);
  if (!fs.existsSync(sidecarPath)) {
    footage[name] = null;
    continue;
  }
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  footage[name] = {
    label: sidecar.label,
    recordedAtUtc: sidecar.recordedAtUtc,
    durationSeconds: sidecar.durationSeconds,
    appCommit: sidecar.appCommit,
    inputs: sidecar.inputs.map((i) => i.path),
    events: sidecar.events,
    results: sidecar.apiResults.map((r) =>
      r.route
        ? { route: r.route, body: r.body }
        : { decision: r.decision, reasonCode: r.reasonCode, anomalyScore: r.anomalyScore === null ? null : Number(r.anomalyScore.toFixed(3)), inferenceMs: r.inferenceMs, totalMs: r.totalMs, modelVersion: r.modelVersion, processingMode: r.processingMode, sessionStatus: r.sessionStatus, sessionAttempts: r.sessionAttempts },
    ),
  };
}

// Each local clip of a test-split image must reproduce the evaluation record (same decision, score within 0.001).
const footageVsEvaluation = [];
for (const [name, clip] of Object.entries(footage)) {
  if (!clip || !name.startsWith("local-")) continue;
  clip.inputs.forEach((input, index) => {
    const result = clip.results[index];
    const rec = input.startsWith("data/visa/") ? record(results, input.replace("data/visa/", "")) : null;
    if (!rec) {
      footageVsEvaluation.push({ clip: name, input, decision: result?.decision, note: "synthetic input; no evaluation record" });
      return;
    }
    const same = result && result.decision === rec.decision && Math.abs(result.anomalyScore - rec.anomalyScore) < 1e-3;
    if (!same) fail(`${name}: ${input} gave ${result?.decision} ${result?.anomalyScore}, evaluation record ${rec.decision} ${rec.anomalyScore}`);
    footageVsEvaluation.push({ clip: name, input, decision: result?.decision, evaluationDecision: rec.decision, anomalyScore: result?.anomalyScore, evaluationScore: Number(rec.anomalyScore.toFixed(3)), match: Boolean(same) });
  });
}

const testImages = new Set(split.splits.test.map((item) => item.image));
const orientation = failureAnalysis.orientationConfound.decisionsByLabelAndOrientation;
const orientationCount = (key) => Object.values(orientation[key]).reduce((a, b) => a + b, 0);

const derived = {
  label: "Exploratory development results",
  notAccuracyNote: "Image AUROC is a threshold-free ranking measure, not accuracy.",
  sources: Object.fromEntries(Object.entries(sources).map(([key, rel]) => [key, { path: rel, sha256: sha256(path.join(repoRoot, rel)) }])),
  evaluation: {
    generatedAt: results.generatedAt,
    evaluationStatus: results.evaluationStatus,
    decisionPolicy: results.decisionPolicy,
    independentEvaluationCompleted: results.independentEvaluationCompleted,
    qualification: results.qualification,
    dataset: `${results.dataset.name} ${results.dataset.category}`,
    datasetLicense: results.dataset.license,
    opencvVersion: results.environment.opencv.version,
    profile: `${results.model.profileId} ${results.model.version}`,
  },
  split: {
    testNormal: results.dataset.splitCounts.test.normal,
    testAnomaly: results.dataset.splitCounts.test.anomaly,
    testTotal: testCount,
    validationNormal: results.dataset.splitCounts.validation.normal,
    validationAnomaly: results.dataset.splitCounts.validation.anomaly,
    bankNormal: results.dataset.splitCounts.bank.normal,
  },
  thresholds: {
    passBelow: Number(results.thresholds.decision.passBelow.toFixed(3)),
    failAtOrAbove: Number(results.thresholds.decision.failAtOrAbove.toFixed(3)),
    identityRecognizedMax: Number(results.thresholds.decision.identityMaxDistance.toFixed(4)),
    identityNoPartMin: Number(results.thresholds.decision.identityNoPartMinDistance.toFixed(4)),
    policy1IdentitySingleThreshold: Number(policy1Profile.decision.identityMaxDistance.toFixed(4)),
  },
  metrics: {
    imageAuroc: { motionqa: results.test.imageAuroc, baseline: results.baseline.testImageAuroc },
    officialSplitAuroc: { motionqa: results.officialSplit.imageAuroc, baseline: results.officialSplit.baselineImageAuroc },
    anomalyToPass: { motionqa: frac(results.test.decisions.anomaly.decisions.PASS, results.test.decisions.anomaly.count), baseline: frac(results.baseline.decisions.anomaly.decisions.PASS, results.baseline.decisions.anomaly.count) },
    normalToFail: { motionqa: frac(results.test.decisions.normal.decisions.FAIL, results.test.decisions.normal.count), baseline: frac(results.baseline.decisions.normal.decisions.FAIL, results.baseline.decisions.normal.count) },
    review: { motionqa: frac(sumDecisions(results.test.decisions, "REVIEW"), testCount), baseline: frac(sumDecisions(results.baseline.decisions, "REVIEW"), testCount) },
    noPart: { motionqa: frac(sumDecisions(results.test.decisions, "NO_PART"), testCount), baseline: frac(sumDecisions(results.baseline.decisions, "NO_PART"), testCount) },
    automatic: { motionqa: frac(automatic(results.test.decisions), testCount), baseline: frac(automatic(results.baseline.decisions), testCount) },
  },
  decisions: {
    motionqa: { normal: results.test.decisions.normal.decisions, anomaly: results.test.decisions.anomaly.decisions },
    baseline: { normal: results.baseline.decisions.normal.decisions, anomaly: results.baseline.decisions.anomaly.decisions },
  },
  policy1: {
    source: sources.policy1,
    generatedAt: policy1.generatedAt,
    review: frac(sumDecisions(policy1.test.decisions, "REVIEW"), testCount),
    noPart: frac(sumDecisions(policy1.test.decisions, "NO_PART"), testCount),
    anomalyToPass: frac(policy1.test.decisions.anomaly.decisions.PASS, policy1.test.decisions.anomaly.count),
    normalToFail: frac(policy1.test.decisions.normal.decisions.FAIL, policy1.test.decisions.normal.count),
    imageAuroc: policy1.test.imageAuroc,
    anomaly043: pick(record(policy1, "Anomaly/043.JPG")),
  },
  cases: {
    anomaly048: {
      ...pick(record(results, "Anomaly/048.JPG")),
      inTestSplit: testImages.has("pcb1/Data/Images/Anomaly/048.JPG"),
      maxScoreInsideGroundTruth: overlap048?.maxScoreInsideGroundTruth ?? null,
      maxScoreOutsideGroundTruth: overlap048?.maxScoreOutsideGroundTruth ?? null,
    },
    anomaly043: { ...pick(record(results, "Anomaly/043.JPG")), inTestSplit: testImages.has("pcb1/Data/Images/Anomaly/043.JPG") },
    normal0027: pick(record(results, "Normal/0027.JPG")),
    falseRejects: results.records.test.filter((r) => r.label === "normal" && r.decision === "FAIL").map((r) => r.image.replace("pcb1/Data/Images/", "")),
  },
  orientation: {
    source: sources.failureAnalysis,
    basis: failureAnalysis.orientationConfound.source,
    anomalyPinsDown: frac(orientationCount("anomaly|pinsDown"), orientationCount("anomaly|pinsDown") + orientationCount("anomaly|pinsUp")),
    normalPinsDown: frac(orientationCount("normal|pinsDown"), orientationCount("normal|pinsDown") + orientationCount("normal|pinsUp")),
    normalPinsDownReview: frac(orientation["normal|pinsDown"].REVIEW, orientationCount("normal|pinsDown")),
    normalPinsUpReview: frac(orientation["normal|pinsUp"].REVIEW, orientationCount("normal|pinsUp")),
  },
  latency: {
    localM2: { inferenceMedianMs: results.latency.inferenceMs.median, endToEndMedianMs: results.latency.endToEndMs.median, samples: results.latency.inferenceMs.count },
    aws: awsDecisions && awsInference && awsServer
      ? {
          source: sources.awsRecord,
          instance: "t4g.small (2 vCPU, Graviton)",
          requests: Number(awsDecisions[4]),
          identicalToLocal: Number(awsDecisions[3]),
          decisions: { PASS: Number(awsDecisions[0]), REVIEW: Number(awsDecisions[1]), FAIL: Number(awsDecisions[2]) },
          inferenceMedianMs: Number(awsInference[0]),
          serverMedianMs: Number(awsServer[0].replace(",", "")),
          stackCreateCompleteUtc: awsStack ? `2026-10-16 ${awsStack[0]}` : null,
        }
      : null,
  },
  problemDefect: overlap000
    ? {
        image: "Anomaly/000",
        defectType: record(results, "Anomaly/000.JPG")?.defectType,
        groundTruthPixels: overlap000.groundTruthPixelsAtModelInput,
        modelInputPixels: results.model.inputSize * results.model.inputSize,
        inputSize: results.model.inputSize,
      }
    : null,
  dataOrigin: {
    source: results.dataset.source,
    license: results.dataset.license,
    archiveBytes: archiveBytesMatch ? Number(archiveBytesMatch[1].replaceAll(",", "")) : null,
    pcb1Normal: results.dataset.splitCounts.bank.normal + results.dataset.splitCounts.validation.normal + results.dataset.splitCounts.test.normal,
    pcb1Anomaly: results.dataset.splitCounts.validation.anomaly + results.dataset.splitCounts.test.anomaly,
    memoryBankPatches: results.model.memoryBank.patches,
    otherObjectValidation: results.dataset.splitCounts.otherObjectValidation.other_object,
    otherObjectTest: results.dataset.splitCounts.otherObjectTest.other_object,
  },
  latencyStages: {
    decodeMs: results.latency.decodeMs.median,
    captureMs: results.latency.captureChecksMs.median,
    inferenceMs: results.latency.inferenceMs.median,
    evidenceMs: results.latency.evidenceMs.median,
    endToEndMs: results.latency.endToEndMs.median,
  },
  history: [
    { run: "Run 1 · whole-part capture gates", generatedAt: run1.generatedAt, source: sources.run1 },
    { run: "Run 2 · gates revised after test outcomes", generatedAt: run2.generatedAt, source: sources.run2 },
    { run: "Run 3 · decision policy 1", generatedAt: policy1.generatedAt, source: sources.policy1 },
    { run: "Policy 2 · after the 043 / 048 failure analysis", generatedAt: results.generatedAt, source: sources.results },
  ],
  testRecords: results.records.test.map((r) => ({ id: r.image.replace("pcb1/Data/Images/", "").replace(".JPG", ""), label: r.label, decision: r.decision, score: Number(r.anomalyScore.toFixed(4)) })),
  footage,
  footageVsEvaluation,
  sourceConflicts: [
    {
      item: "REVIEW count, MotionQA",
      briefValue: "40/153",
      currentValue: `${sumDecisions(results.test.decisions, "REVIEW")}/${testCount}`,
      explanation: `40/153 is decision policy 1 (${sources.policy1}, where Anomaly/043 was NO_PART). The current results file uses policy 2 and sends 043 to REVIEW. The video shows the current value and states the policy-1 value with its source.`,
    },
    {
      item: "Submission package path",
      briefValue: "docs/submission/SUBMISSION_PACKAGE.md or MotionQA_SubmissionPackage.md",
      currentValue: "not found; docs/SUBMISSION_DRAFT.md and docs/DEMO_SCRIPT.md used",
      explanation: "No file with either name exists in the checkout or the user folders searched.",
    },
    {
      item: "SUBMISSION_DRAFT.md limitations",
      briefValue: "lists 'no AWS deployment yet' and REVIEW 41/153",
      currentValue: "AWS deployed 2026-10-16 (evaluation/aws-2026-10-16/README.md)",
      explanation: "The draft's limitation bullet predates the deployment record; the video follows the deployment record.",
    },
  ],
};

// Hard checks that do not depend on the stored file.
const m = derived.metrics;
if (derived.evaluation.independentEvaluationCompleted !== false) fail("results JSON claims an independent evaluation");
if (!/EXPLORATORY/.test(derived.evaluation.evaluationStatus)) fail(`unexpected evaluationStatus ${derived.evaluation.evaluationStatus}`);
if (derived.split.testTotal !== 153) fail(`test denominator is ${derived.split.testTotal}, expected 153`);
for (const key of ["review", "noPart", "automatic"]) {
  for (const who of ["motionqa", "baseline"]) if (m[key][who].d !== derived.split.testTotal) fail(`${key}.${who} denominator ${m[key][who].d} is not ${derived.split.testTotal}`);
}
if (derived.policy1.noPart.n !== 1 || derived.policy1.anomaly043?.decision !== "NO_PART") fail("policy-1 history no longer shows Anomaly/043 as the single NO_PART");
if (derived.policy1.review.d !== 153 || derived.policy1.noPart.d !== 153) fail("policy-1 denominators must include the NO_PART image (153)");
if (derived.cases.anomaly048.decision !== "PASS" || !derived.cases.anomaly048.inTestSplit) fail("Anomaly/048 is not a test-split missed defect (PASS)");
if (!derived.cases.anomaly043.inTestSplit) fail("Anomaly/043 is not in the test split");

// AUROC recomputed from the 153 per-image scores (Mann-Whitney) must equal the stored value.
{
  const pos = derived.testRecords.filter((r) => r.label === "anomaly");
  const neg = derived.testRecords.filter((r) => r.label === "normal");
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p.score > n.score ? 1 : p.score === n.score ? 0.5 : 0;
  const auroc = Number((wins / (pos.length * neg.length)).toFixed(4));
  if (auroc !== derived.metrics.imageAuroc.motionqa) fail(`AUROC from records ${auroc} differs from stored ${derived.metrics.imageAuroc.motionqa}`);
  derived.aurocFromRecords = auroc;
}
if (!pipelineStages) fail("src/data/pipeline-stages.json missing; run scripts/export_pipeline_stages.py");
else {
  for (const [name, stage] of Object.entries(pipelineStages.images)) {
    const rec = record(results, `${name}.JPG`);
    if (!rec || rec.decision !== stage.decision || Math.abs(rec.anomalyScore - stage.anomalyScore) > 1e-3) fail(`pipeline stage export for ${name} (${stage.decision} ${stage.anomalyScore}) differs from the evaluation record`);
  }
  const s048 = pipelineStages.images["Anomaly/048"];
  if (s048 && overlap048 && Math.abs(s048.maxInsideGroundTruth - overlap048.maxScoreInsideGroundTruth) > 1e-3) fail("048 inside-defect maximum differs from the failure analysis");
}

// The brief's historical table, compared explicitly so a silent drift is impossible.
const brief = [
  ["Image AUROC (MotionQA)", m.imageAuroc.motionqa, 0.9745],
  ["Image AUROC (baseline)", m.imageAuroc.baseline, 0.8689],
  ["Anomaly→PASS (MotionQA)", `${m.anomalyToPass.motionqa.n}/${m.anomalyToPass.motionqa.d}`, "1/53"],
  ["Anomaly→PASS (baseline)", `${m.anomalyToPass.baseline.n}/${m.anomalyToPass.baseline.d}`, "0/53"],
  ["Normal→FAIL (MotionQA)", `${m.normalToFail.motionqa.n}/${m.normalToFail.motionqa.d}`, "4/100"],
  ["Normal→FAIL (baseline)", `${m.normalToFail.baseline.n}/${m.normalToFail.baseline.d}`, "7/100"],
  ["REVIEW (baseline)", `${m.review.baseline.n}/${m.review.baseline.d}`, "58/153"],
  ["REVIEW (MotionQA, policy 1 history)", `${derived.policy1.review.n}/${derived.policy1.review.d}`, "40/153"],
];
const briefReport = brief.map(([label, actual, expected]) => ({ label, actual, expected, match: actual === expected }));
for (const row of briefReport) if (!row.match) fail(`brief table: ${row.label} is ${row.actual}, brief says ${row.expected}`);
derived.briefTableCheck = briefReport;

if (write) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(derived, null, 2)}\n`);
  console.log(`wrote ${path.relative(videoRoot, outFile)}`);
} else if (!fs.existsSync(outFile)) {
  fail(`${path.relative(videoRoot, outFile)} missing; run with --write`);
} else {
  const stored = fs.readFileSync(outFile, "utf8");
  if (stored !== `${JSON.stringify(derived, null, 2)}\n`) fail(`${path.relative(videoRoot, outFile)} differs from the sources; run with --write and review the diff`);
}

// On-screen and caption text: exploratory label present, AUROC never called accuracy, no independence claim.
const scanFiles = [...walk(path.join(videoRoot, "src")).filter((f) => /\.(tsx?|json)$/.test(f) && !f.endsWith("verified-results.json")), path.join(videoRoot, "public", "captions", "en.srt")].filter((f) => fs.existsSync(f));
const corpus = scanFiles.map((f) => [f, fs.readFileSync(f, "utf8")]);
if (!corpus.some(([, text]) => text.includes("Exploratory development results"))) fail('label "Exploratory development results" not found in scenes');
for (const [file, text] of corpus) {
  const rel = path.relative(videoRoot, file);
  for (const line of text.split("\n")) {
    if (/accura/i.test(line) && !/not accuracy|is not an accuracy|not an accuracy/i.test(line)) fail(`${rel}: "accuracy" used outside a "not accuracy" statement: ${line.trim().slice(0, 100)}`);
    if (/independent(ly)? (evaluat|validat|test)/i.test(line) && !/(not|no|never|without|has not)\b/i.test(line)) fail(`${rel}: possible independence claim: ${line.trim().slice(0, 100)}`);
    if (/\b(AHM|Astra)\b/.test(line)) fail(`${rel}: mentions AHM/Astra: ${line.trim().slice(0, 100)}`);
    if (/production[- ]ready|deployed in production|in production use/i.test(line)) fail(`${rel}: production claim: ${line.trim().slice(0, 100)}`);
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

finish();

function finish() {
  if (failures.length) {
    console.error(`verify-results: ${failures.length} problem(s)`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`verify-results: ok (${Object.keys(sources).length} sources, ${footageVsEvaluation.length} footage results, brief table ${derived.briefTableCheck.filter((r) => r.match).length}/${derived.briefTableCheck.length} match)`);
}
