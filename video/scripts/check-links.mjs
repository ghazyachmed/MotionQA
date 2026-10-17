// Checks the two judge links and records the result in src/data/links.json. Runs before rendering, never during it.
//
//   node scripts/check-links.mjs
//
// The endpoint check uses only unauthenticated routes: the page, /api/v1/model/status and /api/v1/health.
// An HTTP 200 page alone does not count; the model status must report ready on OpenCV 5.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(videoRoot, "src", "data", "links.json");
const endpoint = "https://d4dqbqmvvujy7.cloudfront.net";
const repository = "https://github.com/ghazyachmed/MotionQA";

async function get(url, accept) {
  const response = await fetch(url, { headers: accept ? { accept } : {}, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  return { status: response.status, text };
}

const checkedAtUtc = new Date().toISOString();
const page = await get(endpoint);
const status = await get(`${endpoint}/api/v1/model/status`, "application/json");
const health = await get(`${endpoint}/api/v1/health`, "application/json");
const model = JSON.parse(status.text);
const healthBody = JSON.parse(health.text);
const repoPage = await get(repository);
const repoApi = JSON.parse((await get("https://api.github.com/repos/ghazyachmed/MotionQA", "application/vnd.github+json")).text);

const endpointOk = page.status === 200 && model.ready === true && model.opencv?.majorVersion === 5 && healthBody.status === "ok";
const repositoryOk = repoPage.status === 200 && repoApi.visibility === "public";

const links = {
  endpoint: {
    url: endpoint,
    ok: endpointOk,
    checkedAtUtc,
    evidence: `page HTTP ${page.status}; model/status ready=${model.ready}, OpenCV ${model.opencv?.version}, profile ${model.profileId} ${model.profileVersion}; health ${healthBody.status}`,
    access: "API and evidence need the operator token, supplied to judges privately",
  },
  repository: {
    url: repository,
    ok: repositoryOk,
    checkedAtUtc,
    evidence: `page HTTP ${repoPage.status}; GitHub API visibility=${repoApi.visibility}, default branch ${repoApi.default_branch}`,
  },
};

fs.writeFileSync(outFile, `${JSON.stringify(links, null, 2)}\n`);
console.log(JSON.stringify(links, null, 2));
if (!endpointOk || !repositoryOk) process.exit(1);
