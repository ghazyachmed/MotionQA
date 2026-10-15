from functools import lru_cache
from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

backendRoot = Path(__file__).resolve().parents[1]


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MOTIONQA_", env_file=".env", extra="ignore")

    appName: str = "MotionQA Backend API"
    postgresDsn: str = Field(default="postgresql+asyncpg://motionqa_admin:motionqa_password@localhost:5432/motionqa_logs", validation_alias="MOTIONQA_POSTGRES_DSN")
    redisUrl: str = Field(default="redis://localhost:6379/0", validation_alias="MOTIONQA_REDIS_URL")
    redisLiveChannel: str = Field(default="liveQcFeed", validation_alias="MOTIONQA_REDIS_LIVE_CHANNEL")
    redisStatePrefix: str = Field(default="liveQcState", validation_alias="MOTIONQA_REDIS_STATE_PREFIX")
    enableRedisPersistence: bool = Field(default=True, validation_alias="MOTIONQA_ENABLE_REDIS_PERSISTENCE")
    allowedOrigins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173", validation_alias="MOTIONQA_ALLOWED_ORIGINS")
    autoCreateTables: bool = Field(default=True, validation_alias="MOTIONQA_AUTO_CREATE_TABLES")
    lineId: str = Field(default="LINE_01", validation_alias="MOTIONQA_LINE_ID")
    stationId: str = Field(default="STATION_01", validation_alias="MOTIONQA_STATION_ID")
    rtspUrl: str | None = Field(default=None, validation_alias="MOTIONQA_RTSP_URL")
    inspectionProfilePath: str = Field(default=str(backendRoot / "models" / "visaPcb1" / "inspectionProfile.json"), validation_alias="MOTIONQA_INSPECTION_PROFILE_PATH")
    inferenceTimeoutSeconds: float = Field(default=10.0, gt=0.0, le=120.0, validation_alias="MOTIONQA_INFERENCE_TIMEOUT_SECONDS")
    maxUploadBytes: int = Field(default=8 * 1024 * 1024, ge=1024, le=32 * 1024 * 1024, validation_alias="MOTIONQA_MAX_UPLOAD_BYTES")
    inspectionRateLimitPerMinute: int = Field(default=30, ge=1, le=6000, validation_alias="MOTIONQA_INSPECTION_RATE_LIMIT_PER_MINUTE")
    demoEventRateLimitPerMinute: int = Field(default=60, ge=1, le=6000, validation_alias="MOTIONQA_DEMO_EVENT_RATE_LIMIT_PER_MINUTE")
    requireAuth: bool = Field(default=True, validation_alias="MOTIONQA_REQUIRE_AUTH")
    apiTokens: str | None = Field(default=None, validation_alias="MOTIONQA_API_TOKENS")
    evidenceBackend: str = Field(default="local", pattern="^(local|s3)$", validation_alias="MOTIONQA_EVIDENCE_BACKEND")
    evidenceDir: str = Field(default=str(backendRoot / "evidence"), validation_alias="MOTIONQA_EVIDENCE_DIR")
    evidenceBucket: str | None = Field(default=None, validation_alias="MOTIONQA_EVIDENCE_BUCKET")
    evidencePrefix: str = Field(default="evidence/", validation_alias="MOTIONQA_EVIDENCE_PREFIX")
    evidenceKmsKeyId: str | None = Field(default=None, validation_alias="MOTIONQA_EVIDENCE_KMS_KEY_ID")
    evidenceRetentionDays: int = Field(default=30, ge=1, le=3650, validation_alias="MOTIONQA_EVIDENCE_RETENTION_DAYS")
    awsRegion: str | None = Field(default=None, validation_alias="AWS_REGION")
    stationPresenceFrames: int = Field(default=5, ge=1, le=300, validation_alias="MOTIONQA_STATION_PRESENCE_FRAMES")
    stationAbsenceFrames: int = Field(default=10, ge=1, le=600, validation_alias="MOTIONQA_STATION_ABSENCE_FRAMES")
    frameStride: int = Field(default=1, ge=1, le=120, validation_alias="MOTIONQA_FRAME_STRIDE")
    ahmMesBaseUrl: str | None = Field(default=None, validation_alias="MOTIONQA_AHM_MES_BASE_URL")
    ahmMesApiKey: str | None = Field(default=None, validation_alias="MOTIONQA_AHM_MES_API_KEY")
    opcUaEndpoint: str | None = Field(default=None, validation_alias="MOTIONQA_OPC_UA_ENDPOINT")
    whatsappWebhookUrl: str | None = Field(default=None, validation_alias="MOTIONQA_WHATSAPP_WEBHOOK_URL")
    smtpHost: str | None = Field(default=None, validation_alias="MOTIONQA_SMTP_HOST")
    smtpPort: int = Field(default=587, validation_alias="MOTIONQA_SMTP_PORT")
    smtpUsername: str | None = Field(default=None, validation_alias="MOTIONQA_SMTP_USERNAME")
    smtpPassword: str | None = Field(default=None, validation_alias="MOTIONQA_SMTP_PASSWORD")
    emailFrom: str | None = Field(default=None, validation_alias="MOTIONQA_EMAIL_FROM")
    emailTo: str | None = Field(default=None, validation_alias="MOTIONQA_EMAIL_TO")
    requestTimeoutSeconds: float = Field(default=5.0, gt=0.0, le=30.0, validation_alias="MOTIONQA_REQUEST_TIMEOUT_SECONDS")
    frontendDistPath: str | None = Field(default=None, validation_alias="MOTIONQA_FRONTEND_DIST_PATH")

    @field_validator("postgresDsn")
    @classmethod
    def normalizePostgresDsn(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        return value

    @property
    def allowedOriginList(self) -> list[str]:
        return [origin.strip() for origin in self.allowedOrigins.split(",") if origin.strip()]

    @property
    def apiTokenList(self) -> list[str]:
        return [token.strip() for token in (self.apiTokens or "").split(",") if len(token.strip()) >= 16]


@lru_cache
def getSettings() -> AppSettings:
    # AI Assisted Logic
    return AppSettings()
