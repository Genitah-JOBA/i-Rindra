# app/besti/router.py
"""
Route de liaison Besti → iRindra (webhook).

Point important : ce routeur est monté directement sur l'application, sans
dépendance d'authentification JWT. Besti ne peut pas présenter de jeton iRindra
(il n'en a pas) ; l'authentification de l'appel est la SIGNATURE (§ signature.py),
vérifiée avant tout traitement.

Deux règles de conception du corps de la requête :

* le corps est reçu en `bytes` via la dépendance de vérification de signature,
  et non déclaré comme paramètre Pydantic. Un corps en paramètre Pydantic
  ferait répondre 422 à FastAPI — y compris au `ping`, qui n'a rien à valider —
  alors que le contrat impose 204 pour le ping et 400 pour un corps invalide ;
* aucune donnée du corps n'est journalisée : Besti y transmet des emails et
  des identifiants de clients.
"""
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.besti.schemas import BestiUser
from app.besti.service import appliquer
from app.besti.signature import verifier_signature_besti
from app.core.database import get_db

logger = logging.getLogger("i-rindra.besti")

router = APIRouter(prefix="/besti", tags=["Besti"])

#: Événements connus. `ping` est traité à part (il ne crée rien).
EVENEMENTS_CONNUS = ("user.activated", "user.updated", "user.deactivated", "ping")


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT)
async def besti_webhook(
    x_besti_event: str = Header(
        ...,
        alias="X-Besti-Event",
        description="user.activated | user.updated | user.deactivated | ping",
    ),
    corps: bytes = Depends(verifier_signature_besti),
    db: AsyncSession = Depends(get_db),
):
    """
    Reçoit un événement Besti et l'applique aux comptes clients iRindra.

    Réponses :
      - 204 : événement traité (dont `ping`, qui ne crée rien) ;
      - 400 : corps invalide ou événement inconnu ;
      - 401 : signature absente, fausse ou horodatage hors tolérance ;
      - 409 : l'email est déjà pris par un compte iRindra non lié (rien n'est
        modifié chez ce compte).
    """
    evenement = x_besti_event.strip()

    if evenement == "ping":
        # Test de liaison : aucune écriture, aucun accès base nécessaire.
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    if evenement not in EVENEMENTS_CONNUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Événement inconnu",
        )

    try:
        # Validation manuelle (et non un paramètre Pydantic) : le contrat veut
        # 400 pour un corps invalide, pas le 422 de FastAPI.
        compte = BestiUser.model_validate_json(corps)
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Compte Besti invalide",
        )

    # `appliquer` lève lui-même le 409 en cas de conflit d'email et le 400 pour
    # un événement inconnu ; il journalise l'identifiant du compte, jamais son
    # contenu.
    await appliquer(db, evenement, compte)

    logger.info("Événement Besti %s traité.", evenement)
    return Response(status_code=status.HTTP_204_NO_CONTENT)