# app/routers/ia.py
"""
Routes IA — base du module.

Endpoints :
  - GET  /ia/status : état de la configuration (sans appel réseau) ;
  - POST /ia/ping   : test de bout en bout vers OpenAI (mini prompt) ;
  - POST /ia/chat   : conversation avec l'assistant IA.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.routers.auth import get_current_user_id, get_current_user_role
from app.schemas.ia import IaPing, IaStatus, ChatRequest, ChatResponse
from app.routers.suggestion_devis import _sauvegarder_suggestion
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


# Mots-clés indiquant une demande de devis (volet financier).
_MOTS_DEVIS = [
    "devis", "tarif", "tarifer", "estimation", "soumission",
    "cotisation", "prix de", "coût de", "cout de", "combien ça coûte",
]


def _demande_de_devis(message: str) -> bool:
    """Détecte si un message de l'assistant est une demande de devis."""
    texte = message.lower().strip()
    return any(mot in texte for mot in _MOTS_DEVIS)


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
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    role: str = Depends(_pilote_ou_plus),
):
    """
    Conversation avec l'assistant IA.

    Accepte un message + un historique optionnel (max 20 messages).
    Le system prompt contextualise l'assistant dans l'écosystème i-Rindra.

    Spécialité volet financier : si la direction/DRH demande un devis
    (mot-clé "devis", "tarif", "estimation"...), la réponse est automatiquement
    sauvegardée dans "Suggestion devis par IA" (table suggestion_devis).
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

    # Sauvegarde automatique si la direction/DRH demande un devis
    suggestion_devis_sauvee = False
    if role in ("direction", "drh") and _demande_de_devis(data.message):
        try:
            await _sauvegarder_suggestion(
                db,
                contenu_devis=resultat.content.strip(),
                demande=data.message,
                modele=resultat.modele,
                cree_par=user_id,
            )
            suggestion_devis_sauvee = True
        except Exception:
            # La sauvegarde ne doit jamais bloquer la conversation.
            suggestion_devis_sauvee = False

    return ChatResponse(
        reponse=resultat.content.strip(),
        modele=resultat.modele,
        tokens=resultat.tokens,
        suggestion_devis_sauvee=suggestion_devis_sauvee,
    )