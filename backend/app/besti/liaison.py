# app/besti/liaison.py
"""
Test de la liaison iRindra ↔ Besti, lancé depuis iRindra (Paramètres).

Pendant du bouton « Tester la liaison » de Besti, pour qui n'a pas accès à
l'administration de Besti. Deux vérifications, sans rien créer ni modifier :

1. **iRindra → Besti (clé d'API).** Appel de `verify-credentials` SANS
   identifiants. Besti contrôle la clé AVANT le corps :
     - clé fausse / absente → 401 « Clé d'API invalide » ;
     - clé acceptée         → 400 « Email et mot de passe requis ».
   Aucun compte n'est donc testé, et Besti inscrit l'appel dans son journal.

2. **Besti → iRindra (webhook).** iRindra s'envoie un `ping` signé avec SON
   secret, par la vraie route `/besti/webhook` (transport ASGI interne, sans
   passer par le réseau). Cela prouve que la route et le secret sont en place.
   Que ce secret soit IDENTIQUE à celui de Besti ne peut être prouvé que par un
   envoi de Besti : le résultat le dit explicitement.

Jamais de secret ni de clé dans la réponse : seulement « configuré » ou non.
"""
import hashlib
import hmac
import json
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.besti.client import CHEMIN_VERIFICATION, DELAI_SECONDES
from app.core.config import settings
from app.routers.auth import get_current_user_role

router = APIRouter(prefix="/besti", tags=["Besti"])


async def _direction_seulement(role: str = Depends(get_current_user_role)):
    if role not in ("direction", "drh"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Réservé à la direction",
        )
    return role


def _resultat(succes: bool, code: int, message: str) -> dict:
    return {"succes": succes, "code": code, "message": message}


async def _tester_cle_api() -> dict:
    """iRindra → Besti : la clé d'API est-elle acceptée ?"""
    if not settings.BESTI_URL:
        return _resultat(False, 0, "BESTI_URL n'est pas définie dans l'environnement d'iRindra.")
    if not settings.BESTI_API_KEY:
        return _resultat(False, 0, "BESTI_API_KEY n'est pas définie dans l'environnement d'iRindra.")

    url = f"{settings.BESTI_URL.rstrip('/')}{CHEMIN_VERIFICATION}"
    try:
        async with httpx.AsyncClient(timeout=DELAI_SECONDES) as client:
            # Corps vide : Besti valide la clé avant le corps, et répond 400
            # sans jamais chercher de compte.
            reponse = await client.post(url, json={}, headers={"X-Api-Key": settings.BESTI_API_KEY})
    except httpx.HTTPError as exc:
        return _resultat(
            False, 0,
            f"Besti injoignable ({type(exc).__name__}) : vérifiez BESTI_URL et que Besti est en ligne.",
        )

    code = reponse.status_code
    if code == 400:
        return _resultat(True, code, "Clé d'API acceptée par Besti.")
    if code == 401:
        return _resultat(
            False, code,
            "Clé d'API refusée : BESTI_API_KEY d'iRindra ne correspond pas à la clé enregistrée dans Besti.",
        )
    if code == 404:
        return _resultat(False, code, "Besti joignable, mais la route d'intégration est introuvable : vérifiez BESTI_URL (adresse de l'API Besti).")
    if code == 429:
        return _resultat(False, code, "Besti limite les appels (trop de tentatives) : réessayez dans une minute.")
    return _resultat(False, code, f"Réponse inattendue de Besti (HTTP {code}).")


async def _tester_webhook(request: Request) -> dict:
    """Besti → iRindra : la route webhook et le secret sont-ils en place ?"""
    secret = settings.BESTI_WEBHOOK_SECRET
    if not secret:
        return _resultat(
            False, 0,
            "BESTI_WEBHOOK_SECRET n'est pas défini dans l'environnement d'iRindra : Besti sera refusé.",
        )

    corps = json.dumps({"event": "ping"}).encode()
    horodatage = str(int(time.time()))
    signature = "sha256=" + hmac.new(
        secret.encode(), horodatage.encode() + b"." + corps, hashlib.sha256
    ).hexdigest()

    transport = httpx.ASGITransport(app=request.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://irindra.interne") as client:
        reponse = await client.post(
            "/besti/webhook",
            content=corps,
            headers={
                "Content-Type": "application/json",
                "X-Besti-Event": "ping",
                "X-Besti-Timestamp": horodatage,
                "X-Besti-Signature": signature,
            },
        )

    if 200 <= reponse.status_code < 300:
        return _resultat(
            True, reponse.status_code,
            "Route /besti/webhook active et secret configuré. L'égalité avec le secret de Besti "
            "se confirme au premier envoi de Besti (ou par son bouton « Tester la liaison »).",
        )
    return _resultat(False, reponse.status_code, f"Le ping signé a été refusé (HTTP {reponse.status_code}).")


@router.post("/liaison/test")
async def tester_liaison(request: Request, _: str = Depends(_direction_seulement)):
    """Teste la liaison avec Besti dans les deux sens (direction / DRH)."""
    return {
        "configuration": {
            "besti_url": settings.BESTI_URL or None,
            "cle_api": bool(settings.BESTI_API_KEY),
            "secret_webhook": bool(settings.BESTI_WEBHOOK_SECRET),
        },
        "irindra_vers_besti": await _tester_cle_api(),
        "besti_vers_irindra": await _tester_webhook(request),
    }
