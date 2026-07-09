from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from .configSettings import AppSettings, getSettings


class Base(DeclarativeBase):
    """Database base."""


def createEngine(settings: AppSettings | None = None) -> AsyncEngine:
    resolvedSettings = settings or getSettings()
    return create_async_engine(resolvedSettings.postgresDsn, pool_pre_ping=True)


engine = createEngine()
asyncSessionMaker = async_sessionmaker(engine, expire_on_commit=False)


async def createTables(targetEngine: AsyncEngine | None = None) -> None:
    # AI Assisted Logic
    resolvedEngine = targetEngine or engine
    async with resolvedEngine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def getDbSession() -> AsyncGenerator[AsyncSession, None]:
    async with asyncSessionMaker() as session:
        yield session
