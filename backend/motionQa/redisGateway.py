import json
from collections.abc import AsyncGenerator
from contextlib import suppress
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.asyncio import Redis
from .configSettings import AppSettings, getSettings
from .inspectionSchemas import InspectionResult


class RedisGateway:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or getSettings()
        self.redis = Redis.from_url(self.settings.redisUrl, decode_responses=True)

    async def publishLiveEvent(self, event: InspectionResult) -> None:
        # AI Assisted Logic
        payload = event.model_dump_json()
        stateKey = f"{self.settings.redisStatePrefix}:{event.processingMode}:{event.lineId}"
        await self.redis.set(stateKey, payload, ex=300)
        await self.redis.publish(self.settings.redisLiveChannel, payload)

    async def claimIntegrationDispatch(self, inspectionId: str) -> bool:
        """True only for the first caller, so retries and duplicate stream messages do not re-send alerts."""
        return bool(await self.redis.set(f"integrationDispatch:{inspectionId}", "1", nx=True, ex=86400))

    async def subscribeLiveEvents(self) -> AsyncGenerator[str, None]:
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(self.settings.redisLiveChannel)
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                data = message.get("data")
                if isinstance(data, bytes):
                    yield data.decode("utf-8")
                elif isinstance(data, str):
                    json.loads(data)
                    yield data
        finally:
            with suppress(RedisConnectionError, ConnectionResetError, RuntimeError):
                await pubsub.unsubscribe(self.settings.redisLiveChannel)
            with suppress(RedisConnectionError, ConnectionResetError, RuntimeError):
                await pubsub.close()

    async def close(self) -> None:
        await self.redis.aclose()
