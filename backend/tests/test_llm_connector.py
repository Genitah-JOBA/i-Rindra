# tests/test_llm_connector.py
"""
Tests unitaires du connecteur LLM (aucun appel réseau réel).

On fausse le client OpenAI pour vérifier :
  - la construction des paramètres (messages, format JSON, modèle) ;
  - la normalisation des erreurs (LLMProviderError + code HTTP) ;
  - le repli quand le fournisseur refuse le mode JSON natif ;
  - l'erreur de configuration quand la clé est absente.

Le SDK `openai` étant le client de tous les fournisseurs, ces tests
valident le câblage quelle que soit l'IA choisie (Groq, Gemini, OpenAI…).
"""
from types import SimpleNamespace

import asyncio

import httpx
import pytest
from openai import BadRequestError, RateLimitError

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
    model = "llama-3.3-70b-versatile"

    def __init__(self, content="OK"):
        self.choices = [_FakeChoice(content)]
        self.usage = _FakeUsage()


def _monter_client_fake(monkeypatch, faire=None):
    """Installe un faux client LLM et capture les paramètres de chaque appel."""
    capteur = {"appels": []}

    async def create(**params):
        # On conserve l'historique pour vérifier le repli (2e appel sans JSON).
        capteur["appels"].append(dict(params))
        capteur.update(params)
        if faire is not None:
            faire(**params, _n=len(capteur["appels"]))
        return _FakeReponse()

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    monkeypatch.setattr(llm, "get_client", lambda: client)
    return capteur


def test_chat_completion_parametres_texte(monkeypatch):
    llm.get_client.cache_clear()
    capteur = _monter_client_fake(monkeypatch)

    resultat = asyncio.run(llm.chat_completion(user="Bonjour", system="Sois bref."))

    assert resultat.content == "OK"
    assert resultat.modele == "llama-3.3-70b-versatile"
    assert capteur["model"] == llm.settings.LLM_MODEL
    assert capteur["messages"][0] == {"role": "system", "content": "Sois bref."}
    assert capteur["messages"][1] == {"role": "user", "content": "Bonjour"}
    assert "response_format" not in capteur


def test_chat_completion_format_json(monkeypatch):
    llm.get_client.cache_clear()
    capteur = _monter_client_fake(monkeypatch)

    asyncio.run(
        llm.chat_completion(
            user='Invente une tache "json".', format="json", temperature=0.0
        )
    )

    assert capteur["response_format"] == {"type": "json_object"}
    assert capteur["temperature"] == 0.0


def test_chat_completion_repli_si_json_natif_refuse(monkeypatch):
    """
    Certains modèles du free tier refusent `response_format` : le connecteur
    doit rejouer l'appel sans ce paramètre au lieu d'échouer.
    """
    appels = []

    def declencher(**params):
        appels.append(params["_n"])
        if params["_n"] == 1:
            requete = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
            reponse = httpx.Response(400, request=requete)
            raise BadRequestError(
                "response_format is not supported by this model",
                response=reponse,
                body={},
            )

    llm.get_client.cache_clear()
    capteur = _monter_client_fake(monkeypatch, faire=declencher)

    resultat = asyncio.run(
        llm.chat_completion(user='Invente une tache "json".', format="json")
    )

    assert resultat.content == "OK"
    assert appels == [1, 2]
    # 1er appel : JSON natif. 2e : repli sans response_format, JSON demandé au prompt.
    assert "response_format" in capteur["appels"][0]
    assert "response_format" not in capteur["appels"][1]
    assert "objet JSON valide" in capteur["appels"][1]["messages"][-1]["content"]


def test_erreur_rate_limit_mappee(monkeypatch):
    def declencher(**params):
        requete = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
        reponse_http = httpx.Response(429, request=requete)
        raise RateLimitError("trop vite", response=reponse_http, body={})

    llm.get_client.cache_clear()
    _monter_client_fake(monkeypatch, faire=declencher)

    with pytest.raises(llm.LLMProviderError) as excinfo:
        asyncio.run(llm.chat_completion(user="ping"))

    assert excinfo.value.status_code == 429


def test_config_sans_cle_api(monkeypatch):
    monkeypatch.setattr(llm.settings, "LLM_API_KEY", "")
    llm.get_client.cache_clear()

    with pytest.raises(llm.LLMConfigError):
        llm.get_client()