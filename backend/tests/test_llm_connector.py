# tests/test_llm_connector.py
"""
Tests unitaires du connecteur OpenAI (aucun appel réseau réel).

On fausse le client OpenAI pour vérifier :
  - la construction des paramètres (messages, format JSON, modèle) ;
  - la normalisation des erreurs (LLMProviderError + code HTTP) ;
  - l'erreur de configuration quand la clé est absente.
"""
from types import SimpleNamespace

import asyncio

import httpx
import pytest
from openai import RateLimitError

from app.services.connectors import llm


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeUsage:
    total_tokens = 12


class _FakeReponse:
    model = "gpt-4o-mini"

    def __init__(self, content="OK"):
        self.choices = [_FakeChoice(content)]
        self.usage = _FakeUsage()


def _monter_client_fake(monkeypatch, faire=None):
    """Installe un faux client OpenAI et capture les paramètres de l'appel."""
    capteur = {}

    async def create(**params):
        capteur.update(params)
        if faire is not None:
            faire(**params)
        return _FakeReponse()

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    monkeypatch.setattr(llm, "get_openai_client", lambda: client)
    return capteur


def test_chat_completion_parametres_texte(monkeypatch):
    llm.get_openai_client.cache_clear()
    capteur = _monter_client_fake(monkeypatch)

    resultat = asyncio.run(llm.chat_completion(user="Bonjour", system="Sois bref."))

    assert resultat.content == "OK"
    assert resultat.modele == "gpt-4o-mini"
    assert capteur["model"] == llm.settings.OPENAI_MODEL
    assert capteur["messages"][0] == {"role": "system", "content": "Sois bref."}
    assert capteur["messages"][1] == {"role": "user", "content": "Bonjour"}
    assert "response_format" not in capteur


def test_chat_completion_format_json(monkeypatch):
    llm.get_openai_client.cache_clear()
    capteur = _monter_client_fake(monkeypatch)

    asyncio.run(
        llm.chat_completion(
            user='Invente une tache "json".', format="json", temperature=0.0
        )
    )

    assert capteur["response_format"] == {"type": "json_object"}
    assert capteur["temperature"] == 0.0


def test_erreur_rate_limit_mappee(monkeypatch):
    def declencher(**params):
        requete = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        reponse_http = httpx.Response(429, request=requete)
        raise RateLimitError("trop vite", response=reponse_http, body={})

    llm.get_openai_client.cache_clear()
    _monter_client_fake(monkeypatch, faire=declencher)

    with pytest.raises(llm.LLMProviderError) as excinfo:
        asyncio.run(llm.chat_completion(user="ping"))

    assert excinfo.value.status_code == 429


def test_config_sans_cle_api(monkeypatch):
    monkeypatch.setattr(llm.settings, "OPENAI_API_KEY", "")
    llm.get_openai_client.cache_clear()

    with pytest.raises(llm.LLMConfigError):
        llm.get_openai_client()