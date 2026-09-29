# app/services/connectors/llm.py
"""
Connecteur LLM — la « base de l'IA ».

Le SDK `openai` sert de client **universel** : tous les fournisseurs retenus
(Groq, Gemini, OpenAI, Ollama…) exposent l'API OpenAI, donc le passage de l'un
à l'autre se limite au `base_url` et au modèle définis dans `settings`
(voir `_FOURNISSEURS` dans app/core/config.py). Aucun code métier ne change.

Centralise :
  - la création paresseuse et mise en cache du client AsyncOpenAI ;
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
    """Erreur du fournisseur LLM durant un appel."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@lru_cache(maxsize=1)
def get_client() -> AsyncOpenAI:
    """
    Retourne le client LLM asynchrone (créé une seule fois).

    `base_url=None` laisse le SDK viser l'API OpenAI officielle ; renseigné,
    il pointe vers le fournisseur choisi (Groq, Gemini, Ollama…).
    """
    if not settings.LLM_API_KEY:
        raise LLMConfigError(
            "LLM_API_KEY n'est pas configurée dans backend/.env "
            f"(fournisseur « {settings.LLM_PROVIDER} »)."
        )
    return AsyncOpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL or None,
        timeout=settings.LLM_TIMEOUT_SECONDS,
        max_retries=2,
    )


# Ancien nom conservé : des appelsants hors de ce module peuvent encore l'utiliser.
get_openai_client = get_client


class LLMResult:
    """Résultat d'un appel de complétion."""

    def __init__(self, content: str, modele: str, tokens: Optional[int] = None):
        self.content = content
        self.modele = modele
        self.tokens = tokens

    def __repr__(self):
        return f"<LLMResult modele={self.modele} tokens={self.tokens}>"


def _normaliser_erreur(exc: OpenAIError) -> LLMProviderError:
    """Associe une erreur du fournisseur à un (message, code HTTP) compréhensible."""
    nom = settings.LLM_PROVIDER
    if isinstance(exc, AuthenticationError):
        return LLMProviderError(f"Clé API {nom} invalide ou expirée.", 401)
    if isinstance(exc, RateLimitError):
        return LLMProviderError(f"Quota {nom} dépassé (rate limit).", 429)
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
    user: str = "",
    system: str = "",
    messages: Optional[List[dict]] = None,
    model: Optional[str] = None,
    format: Literal["text", "json"] = "text",
    temperature: float = 0.4,
    max_tokens: Optional[int] = None,
) -> LLMResult:
    """
    Appel de complétion unique vers le fournisseur LLM configuré.

    - `user` : prompt utilisateur (obligatoire).
    - `system` : instructions système (optionnel, ajouté en premier message).
    - `messages` : pour un dialogue complet — si fourni, `system`/`user` sont ignorés.
    - `format="json"` : demande une réponse en JSON (les prompts doivent alors
      mentionner explicitement le mot « json »).

    Le mode JSON natif (`response_format`) n'est pas supporté par tous les
    modèles des fournisseurs gratuits : en cas de refus, l'appel est rejoué
    sans ce paramètre — le prompt impose alors le format JSON à lui seul.
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
        "model": model or settings.LLM_MODEL,
        "messages": msgs,
        "temperature": temperature,
    }
    if format == "json":
        params["response_format"] = {"type": "json_object"}
    if max_tokens:
        params["max_tokens"] = max_tokens

    client = get_client()

    try:
        reponse = await client.chat.completions.create(**params)
    except LLMConfigError:
        raise
    except BadRequestError as exc:
        # Le fournisseur refuse `response_format` : on retente en mode texte
        # guidé. Toute autre erreur BadRequest est remontée telle quelle.
        details = str(exc).lower()
        refuse_le_json = "response_format" in details or "json" in details
        if "response_format" not in params or not refuse_le_json:
            raise _normaliser_erreur(exc) from exc
        params.pop("response_format")
        logger.warning(
            "Mode JSON natif refusé (%s) — repli sur une sortie JSON guidée par le prompt.",
            exc,
        )
        try:
            reponse = await client.chat.completions.create(**params)
        except OpenAIError as second:
            erreur = _normaliser_erreur(second)
            logger.error("Échec appel LLM [%s] : %s", erreur.status_code, erreur)
            raise erreur from second
    except OpenAIError as exc:
        erreur = _normaliser_erreur(exc)
        logger.error("Échec appel LLM [%s] : %s", erreur.status_code, erreur)
        raise erreur from exc

    contenu = reponse.choices[0].message.content or ""
    tokens = None
    if reponse.usage:
        tokens = reponse.usage.total_tokens

    logger.info("Appel LLM ok — fournisseur=%s modele=%s tokens=%s",
                settings.LLM_PROVIDER, reponse.model, tokens)
    return LLMResult(content=contenu, modele=reponse.model, tokens=tokens)


async def transcrire_image(
    *,
    image_base64: str,
    mime: str,
    prompt: str,
    model: Optional[str] = None,
) -> LLMResult:
    """
    Lecture / transcription d'une image via le modèle vision du fournisseur.

    - `image_base64` : contenu de l'image encodé en base64 ;
    - `mime` : type MIME (ex. "image/png", "image/jpeg") ;
    - `prompt` : instruction de transcription.

    Utilise `LLM_VISION_MODEL` par défaut : sur Groq c'est Llama 4 Scout, sur
    Gemini / OpenAI le modèle textuel gère déjà la vision. Repli sur
    `LLM_MODEL` si aucun modèle vision n'est configuré.
    """
    data_url = f"data:{mime};base64,{image_base64}"
    msgs = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]

    client = get_client()
    try:
        reponse = await client.chat.completions.create(
            model=model or settings.LLM_VISION_MODEL or settings.LLM_MODEL,
            messages=msgs,
            temperature=0.2,
        )
    except LLMConfigError:
        raise
    except OpenAIError as exc:
        erreur = _normaliser_erreur(exc)
        logger.error("Échec transcription image [%s] : %s", erreur.status_code, erreur)
        raise erreur from exc

    contenu = reponse.choices[0].message.content or ""
    tokens = None
    if reponse.usage:
        tokens = reponse.usage.total_tokens

    logger.info("Transcription image ok — fournisseur=%s modele=%s tokens=%s",
                settings.LLM_PROVIDER, reponse.model, tokens)
    return LLMResult(content=contenu, modele=reponse.model, tokens=tokens)