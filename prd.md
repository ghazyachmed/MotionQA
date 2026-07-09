# Product Requirements Document

## Executive Summary

MotionQA is a computer-vision quality inspection system for PT Astra Honda Motor production lines. It uses existing CCTV RTSP feeds to inspect components in real time without stopping the conveyor, targets 100% inspection coverage, and reduces defect pass-through.

## Problem

Manual quality inspection is inconsistent, cannot reliably cover every unit at AHM scale, and does not create real-time traceability data for every component.

## Solution

MotionQA ingests existing CCTV RTSP video, runs YOLOv8 ONNX inference on an edge AI device, auto-flags casting defects, scratches, and dimensional deviations, logs inspection outcomes to PostgreSQL, streams live QC status through Redis and WebSockets, and notifies supervisors.

## Core Requirements

- Process conveyor video at 30-60fps where hardware permits.
- Detect `casting_defect`, `scratch`, `dimensional_deviation`, and `none`.
- Store every pass/fail inspection in PostgreSQL for a 100% digital audit trail.
- Maintain real-time temporary state and Pub/Sub in Redis.
- Provide Live QC Monitor, alert center, and defect trend analytics.
- Integrate outbound REST with SAP/MES AHM.
- Integrate OPC-UA status publishing for PLC and factory sensors.
- Send WhatsApp/email supervisor alerts when configured.

