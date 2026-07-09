import json
from collections.abc import AsyncGenerator
from contextlib import suppress
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.asyncio import Redis
from .configSettings import AppSettings, getSettings
from .streamSchemas import LiveQcEvent


class RedisGateway:
    def __init__(self, settings: AppSettings | None = None):
        self.settings = settings or getSettings()
        self.redis = Redis.from_url(self.settings.redisUrl, decode_responses=True)

    async def publishLiveEvent(self, event: LiveQcEvent) -> None:
        # AI Assisted Logic
        payload = event.model_dump_json()
        stateKey = f"{self.settings.redisStatePrefix}:{event.lineId}"
        await self.redis.set(stateKey, payload, ex=300)
        await self.redis.publish(self.settings.redisLiveChannel, payload)

    async def getCurrentState(self, lineId: str) -> LiveQcEvent | None:
        stateKey = f"{self.settings.redisStatePrefix}:{lineId}"
        payload = await self.redis.get(stateKey)
        if not payload:
            return None
        return LiveQcEvent.model_validate_json(payload)

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
