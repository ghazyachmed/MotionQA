import hmac
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request, status
from .configSettings import AppSettings, getSettings


def isTokenAccepted(candidate: str | None, settings: AppSettings) -> bool:
    if not settings.requireAuth:
        return True
    if not candidate:
        return False
    return any(hmac.compare_digest(candidate, token) for token in settings.apiTokenList)


def extractBearerToken(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def requireOperatorToken(request: Request) -> None:
    # AI Assisted Logic
    settings = getSettings()
    if settings.requireAuth and not settings.apiTokenList:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication is required but MOTIONQA_API_TOKENS is not configured")
    if not isTokenAccepted(extractBearerToken(request), settings):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid operator token", headers={"WWW-Authenticate": "Bearer"})


class SlidingWindowRateLimiter:
    """In-process per-client limit. Sufficient for one API instance; use an upstream limiter when scaling out."""

    def __init__(self, limitPerMinute: int):
        self.limitPerMinute = limitPerMinute
        self.requestTimes: dict[str, deque[float]] = defaultdict(deque)

    def check(self, clientKey: str, now: float | None = None) -> None:
        currentTime = now if now is not None else time.monotonic()
        window = self.requestTimes[clientKey]
        while window and currentTime - window[0] > 60.0:
            window.popleft()
        if len(window) >= self.limitPerMinute:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded", headers={"Retry-After": "60"})
        window.append(currentTime)


def getClientKey(request: Request) -> str:
    return request.client.host if request.client else "unknown"
