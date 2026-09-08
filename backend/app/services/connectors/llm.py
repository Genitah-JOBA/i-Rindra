# app/services/connectors/llm.py
"""
Connecteur OpenAI — la « base de l'IA ».

Centralise :
  - la création paresseuse et mise en cache du client AsyncOpenAI (config dans settings) ;
  - les appels de complétion (texte ou JSON) ;
  - une gestion d'erreurs normalisée : chaque erreur du fournisseur remonte
    comme `LLMProviderError(status_code, message)` que les routers transforment
    en réponse HTTP propre (aucune stack trace ne fuit vers le client).

Les fonctionnalités IA métier (extraction de tâches, résumé, statut proposé…)
ne doivent jamais appeler `openai` directement : elles passent par ici.
"""
import logging
from functools import lru_cache
from typing import List, Literal, Optional

from openai import AsyncOpenAI
from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    OpenAIError,
    RateLimitError,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMConfigError(Exception):
    """Configuration IA manquante ou invalide (ex. clé API absente)."""


class LLMProviderError(Exception):
    """Erreur du fournisseur OpenAI durant un appel."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@lru_cache(maxsize=1)
def get_openai_client() -> AsyncOpenAI:
    """Retourne le client OpenAI asynchrone (créé une seule fois)."""
    if not settings.OPENAI_API_KEY:
        raise LLMConfigError(
            "OPENAI_API_KEY n'est pas configurée dans backend/.env."
        )
    return AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=settings.OPENAI_TIMEOUT_SECONDS,
        max_retries=2,
    )


class LLMResult:
    """Résultat d'un appel de complétion."""

    def __init__(self, content: str, modele: str, tokens: Optional[int] = None):
        self.content = content
        self.modele = modele
        self.tokens = tokens

    def __repr__(self):
        return f"<LLMResult modele={self.modele} tokens={self.tokens}>"


def _normaliser_erreur(exc: OpenAIError) -> LLMProviderError:
    """Associe une erreur OpenAI à un (message, code HTTP) compréhensible."""
    if isinstance(exc, AuthenticationError):
        return LLMProviderError("Clé API OpenAI invalide ou expirée.", 401)
    if isinstance(exc, RateLimitError):
        return LLMProviderError("Quota OpenAI dépassé (rate limit).", 429)
    if isinstance(exc, APIConnectionError):
        return LLMProviderError("Connexion au fournisseur IA impossible.", 503)
    if isinstance(exc, APITimeoutError):
        return LLMProviderError("Le fournisseur IA a mis trop de temps à répondre.", 504)
    if isinstance(exc, BadRequestError):
        return LLMProviderError("Requête refusée par le fournisseur IA.", 400)
    if isinstance(exc, InternalServerError):
        return LLMProviderError("Erreur interne du fournisseur IA.", 502)
    return LLMProviderError(f"Erreur du fournisseur IA : {str(exc) or type(exc).__name__}", 502)


async def chat_completion(
    *,
    user: str,
    system: str = "",
    messages: Optional[List[dict]] = None,
    model: Optional[str] = None,
    format: Literal["text", "json"] = "text",
    temperature: float = 0.4,
    max_tokens: Optional[int] = None,
) -> LLMResult:
    """
    Appel de complétion unique vers OpenAI.

    - `user` : prompt utilisateur (obligatoire).
    - `system` : instructions système (optionnel, ajouté en premier message).
    - `messages` : pour un dialogue complet — si fourni, `system`/`user` sont ignorés.
    - `format="json"` : demande une réponse en JSON (les prompts doivent alors
      mentionner explicitement le mot « json » pour gpt-4o-mini).
    """
    messages = messages or []

    if format == "json" and not any(m.get("content", "").find("json") >= 0 for m in messages):
        suffixe = (
            "\n\nRéponds uniquement avec un objet JSON valide, sans texte autour."
        )
        if system:
            system += suffixe
        else:
            user += suffixe

    if messages:
        msgs = messages
    else:
        msgs = [{"role": "user", "content": user}]
        if system:
            msgs.insert(0, {"role": "system", "content": system})

    params = {
        "model": model or settings.OPENAI_MODEL,
        "messages": msgs,
        "temperature": temperature,
    }
    if format == "json":
        params["response_format"] = {"type": "json_object"}
    if max_tokens:
        params["max_tokens"] = max_tokens

    client = get_openai_client()

    try:
        reponse = await client.chat.completions.create(**params)
    except LLMConfigError:
        raise
    except OpenAIError as exc:
        erreur = _normaliser_erreur(exc)
        logger.error("Échec appel OpenAI [%s] : %s", erreur.status_code, erreur)
        raise erreur from exc

    contenu = reponse.choices[0].message.content or ""
    tokens = None
    if reponse.usage:
        tokens = reponse.usage.total_tokens

    logger.info("Appel OpenAI ok — modele=%s tokens=%s", reponse.model, tokens)
    return LLMResult(content=contenu, modele=reponse.model, tokens=tokens)