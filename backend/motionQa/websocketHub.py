import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from .redisGateway import RedisGateway


class WebsocketHub:
    def __init__(self, redisGateway: RedisGateway):
        self.redisGateway = redisGateway

    async def streamQcEvents(self, websocket: WebSocket) -> None:
        # AI Assisted Logic
        await websocket.accept()
        try:
            async for payload in self.redisGateway.subscribeLiveEvents():
                try:
                    await websocket.send_text(payload)
                except RuntimeError:
                    return
        except (asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
            return
