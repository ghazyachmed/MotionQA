import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .configSettings import AppSettings, getSettings
from .databaseSession import createTables
from .defectRoutes import router as defectRouter
from .healthRoutes import router as healthRouter
from .integrationRoutes import router as integrationRouter
from .liveEventRoutes import router as liveEventRouter
from .redisGateway import RedisGateway
from .redisPersistenceWorker import RedisPersistenceWorker
from .websocketHub import WebsocketHub


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = getSettings()
    if settings.autoCreateTables:
        await createTables()
    worker = RedisPersistenceWorker() if settings.enableRedisPersistence else None
    workerTask = None
    if worker:
        workerTask = asyncio.create_task(worker.run())
    yield
    if workerTask:
        workerTask.cancel()
        with suppress(asyncio.CancelledError):
            await workerTask
    if worker:
        await worker.close()


def createApp() -> FastAPI:
    # AI Assisted Logic
    settings = getSettings()
    app = FastAPI(title=settings.appName, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowedOriginList,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(healthRouter)
    app.include_router(defectRouter)
    app.include_router(integrationRouter)
    app.include_router(liveEventRouter)
    mountFrontendAssets(app, settings)

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
            return {"service": settings.appName, "health": "/api/v1/health", "docs": "/docs", "dashboard": "http://127.0.0.1:5173"}

    @app.websocket("/ws/qc-stream")
    async def qcStream(websocket: WebSocket) -> None:
        redisGateway = RedisGateway(settings)
        try:
            await WebsocketHub(redisGateway).streamQcEvents(websocket)
        finally:
            await redisGateway.close()

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


app = createApp()
