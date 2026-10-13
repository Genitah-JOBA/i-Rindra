# app/besti/fichiers.py
"""
Téléchargement à la demande d'un fichier de projet Besti.

iRindra ne stocke pas les fichiers : le serveur les demande à Besti au moment
du téléchargement et relaie le flux. La clé `BESTI_API_KEY` ne quitte jamais
le serveur et le navigateur ne voit aucune adresse de Besti.

L'appelant DOIT avoir vérifié avant que le fichier appartient à un projet du
client connecté : ce module ne fait aucun contrôle d'accès.

Erreurs, toujours avec un message clair et jamais en 500 :
  - 404 Besti → 404 « fichier plus disponible » ;
  - 401 / 403 Besti (clé refusée), panne, délai, liaison non configurée → 503.
"""
import logging
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.core.config import settings
from app.models.besti_projet import BestiFichier

logger = logging.getLogger("i-rindra.besti")

CHEMIN_FICHIER = "/api/integrations/files/{}"

#: Connexion rapide exigée, mais un gros fichier peut mettre du temps à venir.
DELAI = httpx.Timeout(60.0, connect=8.0)

MESSAGE_INDISPONIBLE = "Téléchargement momentanément indisponible, réessayez plus tard"
MESSAGE_INTROUVABLE = "Ce fichier n'est plus disponible sur Besti"


def _indisponible() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=MESSAGE_INDISPONIBLE,
    )


def _disposition(nom: str) -> str:
    """En-tête de secours (RFC 6266) si Besti n'en fournit pas."""
    return f"attachment; filename*=UTF-8''{quote(nom)}"


async def relayer_fichier(fichier: BestiFichier) -> StreamingResponse:
    """Demande le fichier à Besti et relaie sa réponse en flux."""
    if not settings.BESTI_URL or not settings.BESTI_API_KEY:
        logger.warning("Téléchargement Besti demandé sans liaison configurée.")
        raise _indisponible()

    url = f"{settings.BESTI_URL.rstrip('/')}{CHEMIN_FICHIER.format(fichier.besti_fichier_id)}"
    client = httpx.AsyncClient(timeout=DELAI)
    try:
        reponse = await client.send(
            client.build_request("GET", url, headers={"X-Api-Key": settings.BESTI_API_KEY}),
            stream=True,
        )
    except httpx.HTTPError as exc:
        await client.aclose()
        logger.warning("Téléchargement Besti impossible (%s).", type(exc).__name__)
        raise _indisponible()

    if reponse.status_code != 200:
        code = reponse.status_code
        await reponse.aclose()
        await client.aclose()
        if code == 404:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=MESSAGE_INTROUVABLE)
        if code in (401, 403):
            # Problème de configuration de la liaison, pas du client.
            logger.error("Besti refuse la clé d'API au téléchargement (code %s).", code)
        else:
            logger.warning("Besti a répondu %s au téléchargement.", code)
        raise _indisponible()

    entetes = {
        "Content-Disposition": reponse.headers.get("content-disposition")
        or _disposition(fichier.nom),
        "X-Content-Type-Options": "nosniff",
    }

    async def _fermer():
        await reponse.aclose()
        await client.aclose()

    return StreamingResponse(
        reponse.aiter_bytes(),
        media_type=reponse.headers.get("content-type")
        or fichier.type_mime
        or "application/octet-stream",
        headers=entetes,
        background=BackgroundTask(_fermer),
    )
