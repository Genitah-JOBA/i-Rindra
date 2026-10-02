#  config.py
import os
import secrets
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Charge .env au démarrage
load_dotenv()

# Valeurs par défaut des fournisseurs 100% compatibles avec l'API OpenAI
# (SDK `openai` inchangé : seul le `base_url` et le `model` bougent).
_FOURNISSEURS = {
    # Groq — free tier, très rapide, mode JSON. Modèles réels du compte vérifiés
    # le 29/09/2026 : qwen3.8-27b répond correctement en français, renvoie du
    # JSON strict (compatible avec json.loads dans services/ia.py) et lit les
    # images (testé : décrit correctement une image de couleur unie) — il
    # couvre donc le texte, le JSON et l'OCR avec un seul modèle.
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "model": "qwen/qwen3.8-27b",
        "model_vision": "qwen/qwen3.8-27b",
    },
    # Google Gemini — free tier très généreux, vision + JSON.
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": "gemini-2.5-flash",
        "model_vision": "gemini-2.5-flash",
    },
    # OpenAI — payant, fourni pour pouvoir revenir en arrière.
    "openai": {
        "base_url": "",
        "model": "gpt-4o-mini",
        "model_vision": "gpt-4o-mini",
    },
    # Ollama — 100% gratuit mais local (expose l'API OpenAI).
    "ollama": {
        "base_url": "http://localhost:11434/v1",
        "model": "llama3.1",
        "model_vision": "llama3.2-vision",
    },
}
_FOURNISSEUR_DEFAUT = "groq"


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

    # IA — fournisseur LLM. SDK `openai` conservé : tous les fournisseurs
    # listés dans _FOURNISSEURS exposé l'API OpenAI (aucun code métier ne change).
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", _FOURNISSEUR_DEFAUT)
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "")
    LLM_VISION_MODEL: str = os.getenv("LLM_VISION_MODEL", "")
    LLM_TIMEOUT_SECONDS: float = float(os.getenv("LLM_TIMEOUT_SECONDS", 60))

    # Recherche sémantique (RF-31) — pgvector + modèle d'embeddings LOCAL
    # (fastembed / ONNX). Groq ne fournit pas d'embeddings : le modèle tourne
    # dans le backend, sans clé ni coût. EMBEDDING_DIM doit correspondre au
    # modèle ; en changer vide et reconstruit l'index au prochain démarrage.
    RECHERCHE_VECTORIELLE: bool = os.getenv("RECHERCHE_VECTORIELLE", "true").lower() == "true"
    EMBEDDING_MODEL: str = os.getenv(
        "EMBEDDING_MODEL", "minishlab/potion-multilingual-128M"
    )
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", 256))
    EMBEDDING_CACHE_DIR: str = os.getenv("EMBEDDING_CACHE_DIR", ".cache/fastembed")
    # Filtres de pertinence (calibrés sur potion-multilingual, à revoir si l'on
    # change de modèle) : similarité cosinus minimale, et part minimale du
    # meilleur score (écarte la « traîne » de résultats moyens).
    EMBEDDING_SEUIL: float = float(os.getenv("EMBEDDING_SEUIL", 0.20))
    EMBEDDING_SEUIL_RELATIF: float = float(os.getenv("EMBEDDING_SEUIL_RELATIF", 0.60))

    # Frontend — sert à construire le lien absolu du formulaire de
    # réinitialisation de mot de passe (le backend doit connaître l'URL publique).
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

    # Réinitialisation de mot de passe
    RESET_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", 30))

    # Email (SMTP) — sur o2switch/cPanel, ce sont les serveurs mail de l'hébergeur :
    #   SMTP_HOST=mail.i-rindra.bef4prod.com
    #   SMTP_PORT=465, SMTP_USE_SSL=True  (ou 587 + STARTTLS)
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_USE_SSL: bool = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
    SMTP_STARTTLS: bool = os.getenv("SMTP_STARTTLS", "true").lower() == "true"
    EMAIL_EXPEDITEUR: str = os.getenv("EMAIL_EXPEDITEUR", "no-reply@i-rindra.com")

    # En développement, aucun email n'est envoyé : le lien de réinitialisation
    # est renvoyé dans la réponse et écrit dans les logs du serveur.
    RESET_LIEN_EN_REPONSE: bool = os.getenv("RESET_LIEN_EN_REPONSE", "true").lower() == "true"

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
        if self.APP_ENV == "production":
            # Le jeton de réinitialisation ne doit JAMAIS fuiter dans la réponse
            # HTTP ni les logs en production : on force le renvoi par email.
            self.RESET_LIEN_EN_REPONSE = False
            if not self.SMTP_HOST:
                raise RuntimeError(
                    "SMTP_HOST doit être défini dans .env en production, "
                    "sinon la réinitialisation de mot de passe est inopérante."
                )
        self._resoudre_fournisseur_llm()

    def _resoudre_fournisseur_llm(self):
        """
        Complète les réglages IA avec les valeurs du fournisseur choisi.

        Le `.env` reste prioritaire : seul ce qui n'est pas renseigné est
        déduit de _FOURNISSEURS. Un fournisseur inconnu ne casse pas le
        démarrage (config manuelle possible), il retombe sur le défaut.
        """
        if self.LLM_PROVIDER not in _FOURNISSEURS:
            self.LLM_PROVIDER = _FOURNISSEUR_DEFAUT

        defauts = _FOURNISSEURS[self.LLM_PROVIDER]
        if not self.LLM_BASE_URL:
            self.LLM_BASE_URL = defauts["base_url"]
        if not self.LLM_MODEL:
            self.LLM_MODEL = defauts["model"]
        if not self.LLM_VISION_MODEL:
            self.LLM_VISION_MODEL = defauts["model_vision"] or self.LLM_MODEL

# Instance accessible partout
settings = Settings()
