#  config.py
import os
from pydantic_settings import BaseSettings
from dotnev import load_dotnev

# Charge .env au démarrage
load_dotnev()

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

    # OpenIA
    # OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # class Config:
    #     env_file = ".env"
    #     env_file_encoding = "utf-8"

# Instance accessible partout
settings = Settings()
