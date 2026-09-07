#  config.py
import os
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

    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "1234")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

    # Environnement : "development", "production", "test"
    APP_ENV: str = os.getenv("APP_ENV", "development")

    # Au chargement, refuse un secret faible en production
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.APP_ENV == "production" and self.SECRET_KEY == "1234":
            raise RuntimeError(
                "SECRET_KEY ne doit PAS être la valeur par défaut en production. "
                "Définissez une SECRET_KEY forte dans .env (ex: openssl rand -hex 32)."
            )

# Instance accessible partout
settings = Settings()
