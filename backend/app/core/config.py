#  config.py
import os
import secrets
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Charge .env au démarrage
load_dotenv()

class Settings(BaseSettings):
    """
    Configuration centrale de l'apk
    """

    # BD
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/Gestion_Projet")

    # JWT — en prod, SECRET_KEY DOIT être défini dans .env
    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

    # IA (OpenAI)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_TIMEOUT_SECONDS: float = float(os.getenv("OPENAI_TIMEOUT_SECONDS", 60))

    # Environnement : "development", "production", "test"
    APP_ENV: str = os.getenv("APP_ENV", "development")

    # Au chargement, refuse un secret faible en production
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.APP_ENV == "production" and not os.getenv("SECRET_KEY"):
            raise RuntimeError(
                "SECRET_KEY doit être défini dans .env en production. "
                "Générez-la avec : python -c \"import secrets; print(secrets.token_hex(32))\""
            )

# Instance accessible partout
settings = Settings()
