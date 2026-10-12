# tests/test_charge.py — charge par membre (RF-17) et surcharge (RF-18)
import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.models.tache import PrioriteTache, StatutTache
from app.services import charge


class _Resultat:
    def __init__(self, objets):
        self._objets = objets

    def scalars(self):
        return self

    def all(self):
        return self._objets


class _FausseBase:
    """Renvoie successivement les tâches ouvertes puis les utilisateurs."""

    def __init__(self, *reponses):
        self._reponses = list(reponses)

    async def execute(self, _q):
        return _Resultat(self._reponses.pop(0))


def _tache(resp, projet=1, retard=False, haute=False):
    jour = date.today() + (timedelta(days=-3) if retard else timedelta(days=5))
    return SimpleNamespace(responsable_id=resp, projet_id=projet, echeance=jour, statut=StatutTache.EN_COURS,
                           priorite=PrioriteTache.HAUTE if haute else PrioriteTache.MOYENNE)


def _membre(uid, prenom):
    return SimpleNamespace(id=uid, prenom=prenom, nom="Test", metier="développeur")


@pytest.fixture(autouse=True)
def seuils(monkeypatch):
    monkeypatch.setattr(settings, "CHARGE_SEUIL_TACHES", 3)
    monkeypatch.setattr(settings, "CHARGE_SEUIL_RETARD", 2)


def test_charge_detail_et_tri():
    taches = [_tache(1), _tache(1, retard=True, haute=True), _tache(1, projet=2), _tache(2)]
    res = asyncio.run(charge.charge_par_membre(_FausseBase(taches, [_membre(1, "Ana"), _membre(2, "Bob")]), [1, 2]))
    ana, bob = res
    assert ana["nom"] == "Ana Test" and ana["taches_ouvertes"] == 3
    assert ana["taches_en_retard"] == 1 and ana["taches_haute_priorite"] == 1 and ana["nb_projets"] == 2
    assert ana["charge_pct"] == 100 and ana["surcharge"] is True        # 3 tâches = seuil atteint
    assert bob["taches_ouvertes"] == 1 and bob["surcharge"] is False


def test_surcharge_par_les_retards():
    taches = [_tache(1, retard=True), _tache(1, retard=True)]
    (m,) = asyncio.run(charge.charge_par_membre(_FausseBase(taches, [_membre(1, "Ana")]), [1]))
    assert m["taches_ouvertes"] == 2 and m["surcharge"] is True         # 2 retards = seuil de retard
    assert "dont 2 en retard" in charge.message_surcharge(m)


def test_aucun_projet():
    assert asyncio.run(charge.charge_par_membre(_FausseBase(), [])) == []
