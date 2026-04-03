from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://pokerclub:pokerclub@localhost:5432/pokerclub"

    mp_access_token: str = ""
    mp_webhook_secret: str = ""

    admin_user: str = "admin"
    admin_pass: str = "changeme123"

    jwt_secret: str = "change-this-to-a-random-long-string"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    base_url: str = "http://localhost:5173"
    pix_expiration_minutes: int = 30
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
