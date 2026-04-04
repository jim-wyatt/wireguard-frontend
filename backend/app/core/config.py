import json
from pydantic_settings import BaseSettings
from typing import List


DEFAULT_INSECURE_SECRET = "change-this-secret-key"

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./wireguard.db"
    
    # WireGuard
    WG_INTERFACE: str = "wg0"
    WG_SERVER_IP: str = "10.0.0.1"
    WG_SERVER_PORT: int = 443
    WG_SERVER_PUBLIC_KEY: str = ""
    WG_SERVER_PRIVATE_KEY: str = ""
    WG_SERVER_ENDPOINT: str = ""
    WG_NETWORK: str = "10.0.0.0/24"
    WG_DNS: str = "1.1.1.1,8.8.8.8"
    
    # API
    API_SECRET_KEY: str = "change-this-secret-key"
    API_AUTH_TOKEN: str = ""
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    WRITER_RATE_LIMIT_PER_MINUTE: int = 60
    DASHBOARD_RATE_LIMIT_PER_MINUTE: int = 120
    ENABLE_API_DOCS: bool = False

    def cors_origins_list(self) -> List[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if not raw:
            return []
        if raw.startswith("["):
            parsed = json.loads(raw)
            return [origin.strip() for origin in parsed if isinstance(origin, str) and origin.strip()]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    
    class Config:
        env_file = ".env"
        case_sensitive = True

    def validate_security_configuration(self) -> None:
        auth_token = (self.API_AUTH_TOKEN or "").strip()
        api_secret = (self.API_SECRET_KEY or "").strip()

        if not auth_token and (not api_secret or api_secret == DEFAULT_INSECURE_SECRET):
            raise ValueError("Set API_AUTH_TOKEN or a non-default API_SECRET_KEY before startup")

        origins = self.cors_origins_list()
        if "*" in origins:
            raise ValueError("Wildcard CORS origin is not allowed")

settings = Settings()
