# app/besti/signature.py
"""
Vérification de la signature des webhooks Besti.

Besti signe chaque envoi avec un HMAC-SHA256 calculé sur :

    b"<timestamp>." + corps_brut

Deux points/font la sécurité de cet échange :

1. Le corps doit être le corps BRUT (`await request.body()`), pas un JSON
   re-sérialisé. Besti signe les octets exacts qu'il a envoyés ; reformater le
   JSON (ordre des clés, espaces, accents échappés) invaliderait la signature.
   C'est aussi pourquoi la route ne déclare aucun corps Pydantic.

2. La comparaison se fait en temps constant (`hmac.compare_digest`) : une
   comparaison caractère par caractère laisse fuiter, par la durée de la
   réponse, le nombre de préfixes corrects — assez pour reconstruire une
   signature octet par octet.

L'horodatage est vérifié en plus de la signature : sans cela, une capture
d'un envoi légitime resterait rejouable indéfiniment.
"""
import hashlib
import hmac
import time

from fastapi import Header, HTTPException, Request, status

from app.core.config import settings

#: Fenêtre de tolérance de l'horodatage, en secondes (± 5 minutes).
#: Valeur fixée par le contrat d'échange, volontairement non paramétrable : une
#: tolérance configurable permettrait d'accepter des envois que le contrat déclare
#: périmés.
TOLERANCE_HORODATAGE = 300


async def verifier_signature_besti(
    request: Request,
    x_besti_timestamp: str | None = Header(default=None),
    x_besti_signature: str | None = Header(default=None),
) -> bytes:
    """
    Vérifie la signature d'un envoi Besti et retourne le corps BRUT.

    Lève un `HTTPException` 401 dans tous les cas d'échec, sans distinguer
    « secret absent » de « signature fausse » : un message différent
    permettrait à un tiers de savoir quelle partie est incorrecte.
    """
    secret = settings.BESTI_WEBHOOK_SECRET

    # Liaison Besti non configurée : on refuse tout, silencieusement du point de
    # vue de l'appelant (401, pas 500). Une variable vide ne doit pas non plus
    # empêcher iRindra de démarrer.
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Liaison Besti non configurée",
        )

    if not x_besti_timestamp or not x_besti_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature absente",
        )

    try:
        horodatage = int(x_besti_timestamp)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Horodatage invalide",
        )

    if abs(time.time() - horodatage) > TOLERANCE_HORODATAGE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Horodatage expiré",
        )

    corps = await request.body()

    signature_attendue = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        x_besti_timestamp.encode("utf-8") + b"." + corps,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature_attendue, x_besti_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Signature invalide",
        )

    return corps