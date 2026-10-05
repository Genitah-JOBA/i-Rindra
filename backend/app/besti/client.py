# app/besti/client.py
"""
Vérification des identifiants d'un compte Besti, par appel serveur à serveur.

Ce module est le pendant « sortant » du webhook. Il est appelé quand un
utilisateur tente de se connecter avec un compte lié à Besti, ou avec une
adresse qu'iRindra ne connaît pas.

Deux garde-fous structurants :

* **La clé reste côté serveur.** `BESTI_API_KEY` n'est envoyée qu'ici, dans un
  en-tête d'un appel backend→backend. Elle ne figure jamais dans une réponse
  HTTP ni dans un journal.
* **Aucune fuite d'information.** Une erreur de Besti (503, 500, délai dépassé)
  devient un 503 « Service de connexion momentanément indisponible » : inutile
  de distinguer une panne réseau d'un refus, pour l'appelant. Seuls 401, 403 et
  429 sont traduits mot pour mot, car ce sont des réponses voulues par Besti.
"""
import logging

import httpx
from fastapi import HTTPException, status
from pydantic import ValidationError

from app.besti.schemas import BestiUser
from app.core.config import settings

logger = logging.getLogger("i-rindra.besti")

#: Délai maximal d'attente de Besti lors d'une connexion.
DELAI_SECONDES = 8.0

#: Message unique pour toute indisponibilité de Besti (réseau, délai, 5xx).
MESSAGE_INDISPONIBLE = "Service de connexion momentanément indisponible"

CHEMIN_VERIFICATION = "/api/integrations/verify-credentials"


def _message_besti(reponse: httpx.Response) -> str | None:
    """Extrait `message` du JSON de Besti, sans jamais lever d'exception."""
    try:
        if "application/json" not in reponse.headers.get("content-type", ""):
            return None
        contenu = reponse.json()
    except ValueError:
        return None
    if not isinstance(contenu, dict):
        return None
    message = contenu.get("message")
    return message if isinstance(message, str) and message else None


async def verifier_identifiants(email: str, password: str) -> BestiUser:
    """
    Demande à Besti de valider un couple email / mot de passe.

    Retourne le compte correspondant. Lève un `HTTPException` :
      - 401 si Besti refuse les identifiants ;
      - 403 / 429 avec le message de Besti (compte en attente, non client,
        trop de tentatives) ;
      - 503 si Besti est injoignable ou répond autre chose que 200/401/403/429.
    """
    if not settings.BESTI_URL or not settings.BESTI_API_KEY:
        # Liaison non configurée : on se comporte comme un identifiant inconnu,
        # sans toucher à Besti.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects",
        )

    url = f"{settings.BESTI_URL.rstrip('/')}{CHEMIN_VERIFICATION}"

    try:
        async with httpx.AsyncClient(timeout=DELAI_SECONDES) as client:
            reponse = await client.post(
                url,
                json={"email": email, "password": password},
                headers={"X-Api-Key": settings.BESTI_API_KEY},
            )
    except httpx.HTTPError as exc:
        # Panne réseau, délai dépassé, TLS invalide : Besti est momentanément
        # indisponible. Le détail technique va dans les journaux, pas dans la
        # réponse (il n'aide pas l'utilisateur et révélerait des informations
        # sur l'infrastructure).
        logger.warning(
            "Appel à Besti impossible (%s).", type(exc).__name__
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MESSAGE_INDISPONIBLE,
        )

    if reponse.status_code == 200:
        try:
            return BestiUser.model_validate(reponse.json())
        except ValidationError:
            logger.error("Besti a renvoyé un compte au format inattendu.")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=MESSAGE_INDISPONIBLE,
            )

    if reponse.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if reponse.status_code == 403:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_message_besti(reponse) or "Compte non autorisé",
        )

    if reponse.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_message_besti(reponse) or "Trop de tentatives",
        )

    logger.warning("Besti a répondu avec le code %s.", reponse.status_code)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=MESSAGE_INDISPONIBLE,
    )