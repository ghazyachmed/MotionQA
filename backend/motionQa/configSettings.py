from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    lineId: str = Field(default="LINE_KARAWANG_01", validation_alias="MOTIONQA_LINE_ID")
    rtspUrl: str | None = Field(default=None, validation_alias="MOTIONQA_RTSP_URL")
    modelPath: str = Field(default="models/yolov8AhmEdge.onnx", validation_alias="MOTIONQA_MODEL_PATH")
    modelInputName: str = Field(default="images", validation_alias="MOTIONQA_MODEL_INPUT_NAME")
    modelConfidenceThreshold: float = Field(default=0.45, ge=0.0, le=1.0, validation_alias="MOTIONQA_MODEL_CONFIDENCE_THRESHOLD")
    modelIouThreshold: float = Field(default=0.45, ge=0.0, le=1.0, validation_alias="MOTIONQA_MODEL_IOU_THRESHOLD")
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


@lru_cache
def getSettings() -> AppSettings:
    # AI Assisted Logic
    return AppSettings()
