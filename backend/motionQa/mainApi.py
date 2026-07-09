import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from .configSettings import getSettings
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


app = createApp()
