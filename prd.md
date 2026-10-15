# Product Requirements Document

## Executive Summary

MotionQA is a computer-vision quality-inspection product. The intended target context is component inspection on
motorcycle production lines (for example in Indonesia). No manufacturer partnership, site access, or target-component
dataset is in place; the target context is a product hypothesis, not a validated deployment.

Positioning hypothesis (not yet verified against competitors): reliable inspection with explicit uncertainty and human
review — the system says `REVIEW`, `RETAKE`, or `NO_PART` instead of forcing every image into pass or fail.

## Problem

Manual visual inspection varies between inspectors and shifts, and paper records make it hard to trace which part was
inspected, by whom, and on what evidence.

## Current MVP scope (implemented)

- One explicit inspection per capture (upload or camera button), or one per part placement on a stationary RTSP camera.
- Decision states `NO_PART`, `RETAKE`, `REVIEW`, `PASS`, `FAIL`, `ERROR`, each with a reason, scores, thresholds, model
  identity, latency, and stored image evidence.
- Normal-only anomaly detection (OpenCV 5 DNN features + nearest-neighbour scoring), evaluated on the public VisA `pcb1`
  benchmark. Defects are localized, not classified.
- Human review of `FAIL` and `REVIEW` results with the machine decision preserved.
- Simulated browser demo kept separate from real inference records and metrics.

## Product goals (not yet met)

- Validation on the target components with a labelled dataset from the target line (see `docs/EVALUATION.md`).
- Defect taxonomy for the target components (for example casting porosity, scratches). Dimensional checks require a
  calibrated camera and scale reference and are out of scope until those exist.
- Throughput targets for continuous conveyor inspection; current measurements are single-image latencies on a laptop CPU.
- MES/ERP and PLC (OPC-UA) integration and supervisor alerts: client code exists, none has been tested against a real system.
