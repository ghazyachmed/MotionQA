# MotionQA

MotionQA is a Fase 0 prototype for AI-powered visual defect detection on PT Astra Honda Motor production lines. It runs on top of existing AHM CCTV RTSP feeds, performs YOLOv8 ONNX inference on an edge device or GPU server, logs every component inspection to PostgreSQL, streams live state through Redis Pub/Sub and FastAPI WebSockets, and exposes a React + TypeScript + Tailwind QC dashboard.

## Architecture Boundary

- Input: existing CCTV RTSP stream only.
- Edge AI: NVIDIA Jetson or GPU server running YOLOv8 ONNX inference at the line.
- Backend: Python 3.11 FastAPI, PostgreSQL defect log, Redis real-time cache and Pub/Sub.
- Frontend: React Vite TypeScript Tailwind live QC monitor, alert center, and defect trend analytics.
- Integrations: REST API to SAP/MES AHM, OPC-UA to PLC/sensors, WhatsApp/email supervisor alerts.

No new camera hardware, Kafka, cloud-only services, or unapproved microservices are introduced.

## Model Choice

The public `AswinG5/moto-parts-30cls` Hugging Face model is registered as a motorcycle-component classification checkpoint for transfer-learning experiments. The repository confirms it is YOLOv8n-cls with 30 classes, not a defect detector. MotionQA production inference therefore expects a custom AHM defect detector exported to ONNX at `models/yolov8AhmEdge.onnx`.

## Run Locally

```bash
cp environmentExample .env
docker compose -f dockerCompose.yml up --build postgresDb redisCache backendApi frontendUi
```

Run the RTSP edge pipeline after setting `MOTIONQA_RTSP_URL` and mounting an ONNX model:

```bash
docker compose -f dockerCompose.yml --profile edge up --build edgeProcessor
```

Backend only:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[test]"
uvicorn motionQa.mainApi:createApp --factory --reload
```

Frontend only:

```bash
cd frontend
npm install
npm run dev
```

## Local MVP Camera Test

Run the backend and frontend separately. Port `8000` is the API, so opening `http://127.0.0.1:8000` shows backend JSON/docs. The dashboard UI is on `http://127.0.0.1:5173`.

Backend:

```bash
cd /Users/ghazy/Documents/MotionQA
. .venv/bin/activate
MOTIONQA_POSTGRES_DSN=postgresql+asyncpg://ghazy@localhost:5432/motionqa_logs \
MOTIONQA_REDIS_URL=redis://localhost:6379/0 \
uvicorn motionQa.mainApi:createApp --factory --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd /Users/ghazy/Documents/MotionQA/frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`, keep the mode on `Auto QC`, then click `Photo` and upload one of these local MVP samples:

- `/Users/ghazy/Documents/MotionQA/sampleImages/motionQaOkMotorPart.png`
- `/Users/ghazy/Documents/MotionQA/sampleImages/motionQaDefectScratch.png`
- `/Users/ghazy/Documents/MotionQA/sampleImages/motionQaDefectCasting.png`

`Auto QC` reads the image content. `OK Part`, `Scratch`, and `Casting` are demo filters for controlled presentation scenarios.

To test with a laptop camera, click `Camera` and allow Chrome camera access. If Chrome selects `Camo Camera` and the preview is black, use the camera device dropdown to pick the built-in/FaceTime/Continuity camera, or click `Photo` for a deterministic MVP test. The uploaded photo is analyzed locally in the browser, rendered in the live monitor, and published through the same backend event path.

This laptop camera path is only for local MVP demos. Production MotionQA still uses existing AHM CCTV RTSP feeds and YOLOv8 ONNX inference on the edge device.

## Training And Export

Train a YOLOv8 detector with an AHM defect dataset:

```bash
python -m motionQa.edge.modelTrainingPipeline --dataset-yaml datasets/ahmDefects.yaml --output-dir runs/defectTraining
```

Export a trained detector to ONNX:

```bash
python -m motionQa.edge.modelExportPipeline --model-path runs/detect/train/weights/best.pt --output-dir models
```

Download the motorcycle-parts classifier checkpoint for component metadata experiments:

```bash
python -m motionQa.edge.modelRegistry --download-component-classifier
```
