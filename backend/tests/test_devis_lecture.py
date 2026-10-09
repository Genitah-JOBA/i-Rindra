# tests/test_devis_lecture.py — « Devis & Estimations » : consultation par l'équipe
import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models.suggestion_devis import StatutSuggestionDevis, SuggestionDevis
from app.routers import suggestion_devis as r
from app.routers.auth import get_current_user_id, get_current_user_role


def _sql(q) -> str:
    return str(q.compile(compile_kwargs={"literal_binds": True}))


def test_direction_voit_tout():
    q = r._filtrer_lecture(select(SuggestionDevis), "direction", 1)
    assert "WHERE" not in _sql(q)


def test_chef_de_projet_ne_voit_que_les_devis_valides():
    sql = _sql(r._filtrer_lecture(select(SuggestionDevis), "chef_de_projet", 1))
    assert "validee" in sql
    assert "projet_membre" not in sql  # tous les projets


def test_equipe_limitee_a_ses_projets_et_aux_devis_valides():
    sql = _sql(r._filtrer_lecture(select(SuggestionDevis), "equipe", 42))
    assert "validee" in sql
    assert "projet_membre" in sql and "42" in sql


class _FauxResultat:
    def __init__(self, ids):
        self._ids = ids

    def scalars(self):
        return self

    def all(self):
        return self._ids


class _FausseBase:
    def __init__(self, ids):
        self._ids = ids

    async def execute(self, _q):
        return _FauxResultat(self._ids)


def _devis(statut, projet_id=7):
    d = SuggestionDevis()
    d.statut = statut
    d.projet_id = projet_id
    return d


@pytest.mark.parametrize("role,statut,projets,autorise", [
    ("direction", StatutSuggestionDevis.EN_ATTENTE, [], True),
    ("chef_de_projet", StatutSuggestionDevis.VALIDEE, [], True),
    ("chef_de_projet", StatutSuggestionDevis.EN_ATTENTE, [], False),
    ("equipe", StatutSuggestionDevis.VALIDEE, [7], True),
    ("equipe", StatutSuggestionDevis.VALIDEE, [3], False),
    ("equipe", StatutSuggestionDevis.REFUSEE, [7], False),
])
def test_verifier_lecture(role, statut, projets, autorise):
    appel = r._verifier_lecture(_FausseBase(projets), _devis(statut), role, 1)
    if autorise:
        asyncio.run(appel)
    else:
        with pytest.raises(HTTPException) as e:
            asyncio.run(appel)
        assert e.value.status_code == 404  # on ne révèle pas l'existence du devis


@pytest.fixture
def client_api():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _connecte(role):
    app.dependency_overrides[get_current_user_role] = lambda: role
    app.dependency_overrides[get_current_user_id] = lambda: 1


def test_client_refuse(client_api):
    _connecte("client")
    assert client_api.get("/suggestion-devis/").status_code == 403


@pytest.mark.parametrize("role", ["chef_de_projet", "equipe"])
def test_actions_reservees_a_la_direction(client_api, role):
    _connecte(role)
    assert client_api.post("/suggestion-devis/ia", json={}).status_code == 403
    assert client_api.patch("/suggestion-devis/1/statut", json={"statut": "validee"}).status_code == 403
    assert client_api.delete("/suggestion-devis/1").status_code == 403
