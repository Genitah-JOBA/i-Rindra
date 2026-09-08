# app/routers/ia.py
"""
Routes IA — base du module.

Deux endpoints utiles pour valider la « fondation » :
  - GET  /ia/status : état de la configuration (sans appel réseau) ;
  - POST /ia/ping   : test de bout en bout vers OpenAI (mini prompt).

Les fonctionnalités métier (extraction, résumé, statut…) arriveront ici ensuite.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.routers.auth import get_current_user_role
from app.schemas.ia import IaPing, IaStatus
from app.services.connectors.llm import (
    LLMConfigError,
    LLMProviderError,
    chat_completion,
)

router = APIRouter(prefix="/ia", tags=["IA"])


async def _pilote_ou_plus(role: str = Depends(get_current_user_role)):
    """L'IA consomme des crédits : réservée aux comptes admin / direction."""
    if role not in ("admin", "direction"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé à la direction ou à l'administrateur.",
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