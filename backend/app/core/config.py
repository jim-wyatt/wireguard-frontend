import json
from pydantic_settings import BaseSettings
from typing import List

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
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

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

settings = Settings()
