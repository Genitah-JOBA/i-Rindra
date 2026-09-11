# app/routers/ia.py
"""
Routes IA — base du module.

Endpoints :
  - GET  /ia/status : état de la configuration (sans appel réseau) ;
  - POST /ia/ping   : test de bout en bout vers OpenAI (mini prompt) ;
  - POST /ia/chat   : conversation avec l'assistant IA.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.routers.auth import get_current_user_role
from app.schemas.ia import IaPing, IaStatus, ChatRequest, ChatResponse
from app.services.connectors.llm import (
    LLMConfigError,
    LLMProviderError,
    chat_completion,
)

router = APIRouter(prefix="/ia", tags=["IA"])

SYSTEM_PROMPT = (
    "Tu es l'assistant IA de la plateforme i-Rindra, un outil de gestion de projets "
    "pour l'agence Bienfe. Tu aides les utilisateurs (direction, DRH, chefs de "
    "projet, équipe) avec :\n"
    "- La planification et le suivi de projets\n"
    "- La gestion de tâches et le Kanban\n"
    "- L'analyse de deadlines et les risques de retard\n"
    "- Les résumés d'avancement\n"
    "- Les conseils sur l'organisation et la productivité\n\n"
    "Tu réponds de manière concise et professionnelle en français. "
    "Si on te pose une question hors sujet, redirige poliment vers les fonctionnalités de la plateforme."
)


async def _pilote_ou_plus(role: str = Depends(get_current_user_role)):
    """L'IA consomme des crédits : réservée aux comptes internes."""
    if role not in ("direction", "drh", "chef_de_projet", "equipe"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux comptes internes.",
        )
    return role


@router.get("/status", response_model=IaStatus)
async def ia_status(_: str = Depends(get_current_user_role)):
    """
    État de la configuration IA.

    Rapide, aucun appel réseau : indique si la clé est configurée
    et le modèle sélectionné pour les appels.
    """
    return IaStatus(
        configuree=bool(settings.OPENAI_API_KEY),
        modele=settings.OPENAI_MODEL,
    )


@router.post("/ping", response_model=IaPing)
async def ia_ping(_: str = Depends(_pilote_ou_plus)):
    """
    Test de bout en bout : envoie un mini prompt à OpenAI.

    Vérifie la clé, la connectivité et le modèle configuré.
    Renvoie la réponse brute (texte) et le modèle réellement utilisé.
    """
    try:
        resultat = await chat_completion(
            system="Tu réponds en un mot, sans ponctuation.",
            user="Dis OK si tu me lis.",
            temperature=0.0,
            max_tokens=5,
        )
    except LLMConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return IaPing(
        ok=True,
        reponse=resultat.content.strip()[:100],
        modele=resultat.modele,
        tokens=resultat.tokens,
    )


@router.post("/chat", response_model=ChatResponse)
async def ia_chat(
    data: ChatRequest,
    _: str = Depends(_pilote_ou_plus),
):
    """
    Conversation avec l'assistant IA.

    Accepte un message + un historique optionnel (max 20 messages).
    Le system prompt contextualise l'assistant dans l'écosystème i-Rindra.
    """
    # Construit la liste des messages pour l'API OpenAI
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Ajoute l'historique (tronqué aux 20 derniers pour limiter les tokens)
    if data.historique:
        for msg in data.historique[-20:]:
            if msg.role in ("user", "assistant"):
                messages.append({"role": msg.role, "content": msg.content})

    # Ajoute le message courant
    messages.append({"role": "user", "content": data.message})

    try:
        resultat = await chat_completion(
            messages=messages,
            temperature=0.5,
            max_tokens=1024,
        )
    except LLMConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return ChatResponse(
        reponse=resultat.content.strip(),
        modele=resultat.modele,
        tokens=resultat.tokens,
    )