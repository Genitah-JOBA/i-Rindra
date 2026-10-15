# tests/test_besti_liaison.py — test de liaison iRindra ↔ Besti (Paramètres)
import httpx
import pytest
from fastapi.testclient import TestClient

from app.besti import liaison
from app.core.config import settings
from app.main import app
from app.routers.auth import get_current_user_role


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "BESTI_URL", "https://besti.test")
    monkeypatch.setattr(settings, "BESTI_API_KEY", "cle-de-test")
    monkeypatch.setattr(settings, "BESTI_WEBHOOK_SECRET", "secret-de-test")
    yield TestClient(app)
    app.dependency_overrides.clear()


def _besti_repond(monkeypatch, code):
    """Remplace l'appel à Besti par une réponse fixe (aucun appel réseau)."""
    async def faux(self, url, **kwargs):
        assert kwargs["headers"]["X-Api-Key"] == "cle-de-test"
        assert kwargs["json"] == {}  # jamais d'identifiants dans le test
        return httpx.Response(code, json={"message": "x"})
    monkeypatch.setattr(httpx.AsyncClient, "post", faux, raising=True)


def _role(role):
    app.dependency_overrides[get_current_user_role] = lambda: role


def test_reserve_a_la_direction(client):
    assert client.post("/besti/liaison/test").status_code == 401
    _role("chef_de_projet")
    assert client.post("/besti/liaison/test").status_code == 403


@pytest.mark.parametrize("code,succes", [(400, True), (401, False), (404, False), (503, False)])
def test_interpretation_reponse_besti(client, monkeypatch, code, succes):
    _besti_repond(monkeypatch, code)
    _role("direction")
    import asyncio
    resultat = asyncio.run(liaison._tester_cle_api())
    assert resultat["succes"] is succes
    assert resultat["code"] == code


def test_cle_absente(client, monkeypatch):
    monkeypatch.setattr(settings, "BESTI_API_KEY", "")
    import asyncio
    resultat = asyncio.run(liaison._tester_cle_api())
    assert resultat["succes"] is False
    assert "BESTI_API_KEY" in resultat["message"]


def test_webhook_ping_signe_accepte(client, monkeypatch):
    # L'appel sortant vers Besti est neutralisé ; le ping interne passe par la vraie route
    async def cle_ok():
        return liaison._resultat(True, 400, "ok")
    monkeypatch.setattr(liaison, "_tester_cle_api", cle_ok)
    _role("drh")
    r = client.post("/besti/liaison/test")
    assert r.status_code == 200
    corps = r.json()
    assert corps["besti_vers_irindra"]["succes"] is True
    assert corps["besti_vers_irindra"]["code"] == 204
    # Jamais de secret ni de clé dans la réponse
    assert "secret-de-test" not in r.text and "cle-de-test" not in r.text


def test_webhook_sans_secret(client, monkeypatch):
    monkeypatch.setattr(settings, "BESTI_WEBHOOK_SECRET", "")
    async def cle_ok():
        return liaison._resultat(True, 400, "ok")
    monkeypatch.setattr(liaison, "_tester_cle_api", cle_ok)
    _role("direction")
    corps = client.post("/besti/liaison/test").json()
    assert corps["besti_vers_irindra"]["succes"] is False
    assert "BESTI_WEBHOOK_SECRET" in corps["besti_vers_irindra"]["message"]
