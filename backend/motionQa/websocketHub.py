import asyncio
from fastapi import WebSocket, WebSocketDisconnect, status
from .accessControl import isTokenAccepted
from .configSettings import getSettings
from .redisGateway import RedisGateway


class WebsocketHub:
    def __init__(self, redisGateway: RedisGateway):
        self.redisGateway = redisGateway

    async def streamQcEvents(self, websocket: WebSocket) -> None:
        # AI Assisted Logic
        # Browsers cannot set Authorization headers on WebSockets, so the operator token travels as a query parameter.
        # Accept before closing so the browser receives close code 1008 (a pre-accept rejection surfaces only as 1006).
        await websocket.accept()
        if not isTokenAccepted(websocket.query_params.get("token"), getSettings()):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="operator token required")
            return
        try:
            async for payload in self.redisGateway.subscribeLiveEvents():
                try:
                    await websocket.send_text(payload)
                except RuntimeError:
                    return
        except (asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
            return
