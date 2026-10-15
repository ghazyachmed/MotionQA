import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .accessControl import SlidingWindowRateLimiter
from .configSettings import AppSettings, getSettings
from .databaseSession import createTables
from .dependencyContainer import createEvidenceStore, createInspectionPipeline
from .healthRoutes import router as healthRouter
from .inspectionRoutes import modelRouter, router as inspectionRouter
from .integrationRoutes import router as integrationRouter
from .liveEventRoutes import router as liveEventRouter
from .redisGateway import RedisGateway
from .redisPersistenceWorker import RedisPersistenceWorker
from .websocketHub import WebsocketHub

logger = logging.getLogger("motionQa.api")


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {"time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(), "level": record.levelname, "logger": record.name, "message": record.getMessage()}
        for key in ("requestId", "method", "path", "statusCode", "durationMs"):
            if hasattr(record, key):
                entry[key] = getattr(record, key)
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry)


def configureLogging() -> None:
    rootLogger = logging.getLogger("motionQa")
    if rootLogger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    rootLogger.addHandler(handler)
    rootLogger.setLevel(logging.INFO)
    rootLogger.propagate = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = getSettings()
    if settings.autoCreateTables:
        await createTables()
    worker = RedisPersistenceWorker() if settings.enableRedisPersistence else None
    workerTask = asyncio.create_task(worker.run()) if worker else None
    purged = await asyncio.to_thread(app.state.evidenceStore.purgeExpired)
    logger.info("startup complete; evidence purged=%d; model=%s", purged, json.dumps(app.state.inspectionPipeline.getStatus(), default=str))
    yield
    if workerTask:
        workerTask.cancel()
        with suppress(asyncio.CancelledError):
            await workerTask
    if worker:
        await worker.close()


def createApp() -> FastAPI:
    # AI Assisted Logic
    configureLogging()
    settings = getSettings()
    app = FastAPI(title=settings.appName, lifespan=lifespan)
    app.state.settings = settings
    app.state.evidenceStore = createEvidenceStore(settings)
    app.state.inspectionPipeline = createInspectionPipeline(settings, app.state.evidenceStore)
    app.state.inspectionRateLimiter = SlidingWindowRateLimiter(settings.inspectionRateLimitPerMinute)
    app.state.demoRateLimiter = SlidingWindowRateLimiter(settings.demoEventRateLimitPerMinute)
    if not settings.requireAuth:
        logger.warning("MOTIONQA_REQUIRE_AUTH=false: inspection endpoints are open; use only on a trusted local machine")
    if not app.state.inspectionPipeline.isReady:
        logger.error("inspection model unavailable; real inspections will return ERROR: %s", app.state.inspectionPipeline.loadError)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowedOriginList,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Idempotent-Replay", "X-MotionQA-Live-Publish", "X-Request-Id"],
    )

    @app.middleware("http")
    async def logRequests(request: Request, callNext):
        requestId = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]
        startTime = time.perf_counter()
        response = await callNext(request)
        response.headers["X-Request-Id"] = requestId
        logger.info(
            "request",
            extra={"requestId": requestId, "method": request.method, "path": request.url.path, "statusCode": response.status_code, "durationMs": round((time.perf_counter() - startTime) * 1000, 2)},
        )
        return response

    app.include_router(healthRouter)
    app.include_router(modelRouter)
    app.include_router(inspectionRouter)
    app.include_router(integrationRouter)
    app.include_router(liveEventRouter)
    mountFrontendAssets(app, settings)

    @app.websocket("/ws/qc-stream")
    async def qcStream(websocket: WebSocket) -> None:
        redisGateway = RedisGateway(settings)
        try:
            await WebsocketHub(redisGateway).streamQcEvents(websocket)
        finally:
            await redisGateway.close()

    frontendDistPath = resolveFrontendDistPath(settings)
    if frontendDistPath:
        @app.get("/", include_in_schema=False)
        async def getFrontendIndex() -> FileResponse:
            return FileResponse(frontendDistPath / "index.html")

        @app.get("/{fullPath:path}", include_in_schema=False)
        async def getFrontendFallback(fullPath: str) -> FileResponse:
            return FileResponse(frontendDistPath / "index.html")
    else:
        @app.get("/")
        async def getRoot() -> dict[str, str]:
            return {"service": settings.appName, "health": "/api/v1/health", "model": "/api/v1/model/status", "docs": "/docs"}

    return app


def mountFrontendAssets(app: FastAPI, settings: AppSettings) -> None:
    frontendDistPath = resolveFrontendDistPath(settings)
    if not frontendDistPath:
        return
    assetPath = frontendDistPath / "assets"
    if assetPath.exists():
        app.mount("/assets", StaticFiles(directory=assetPath), name="assets")


def resolveFrontendDistPath(settings: AppSettings) -> Path | None:
    candidatePaths = []
    if settings.frontendDistPath:
        candidatePaths.append(Path(settings.frontendDistPath))
    packageRootPath = Path(__file__).resolve().parents[1]
    repoRootPath = Path(__file__).resolve().parents[2]
    candidatePaths.extend([packageRootPath / "frontend" / "dist", repoRootPath / "frontend" / "dist"])
    for candidatePath in candidatePaths:
        if (candidatePath / "index.html").exists():
            return candidatePath
    return None
