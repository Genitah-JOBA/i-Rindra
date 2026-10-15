# tests/test_alertes_internes.py — notifications internes (projet en retard / rouge,
# échéance proche, surcharge), anti-doublon et réarmement.
import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.models.projet import StatutSante
from app.models.tache import StatutTache
from app.services import alertes_internes as ai


class _Resultat:
    def __init__(self, objets):
        self._objets = objets

    def scalars(self):
        return self

    def all(self):
        return self._objets

    def __iter__(self):
        return iter(self._objets)

    def scalar_one(self):
        return self._objets[0]


class _FausseBase:
    """Renvoie successivement les réponses fournies, une par requête."""

    def __init__(self, *reponses):
        self._reponses = list(reponses)

    async def execute(self, _q):
        return _Resultat(self._reponses.pop(0))


@pytest.fixture
def envois(monkeypatch):
    """Capture les notifications ; destinataires simulés : gestion = [10], équipe = [20]."""
    recues = []

    async def notifier(_db, ids, type_, message, lien):
        recues.append(SimpleNamespace(ids=list(ids), type=type_, message=message, lien=lien))

    async def ids_gestion(_db):
        return [10]

    async def sans_clients(_db, ids):
        return [i for i in dict.fromkeys(ids) if i and i != 99]  # 99 = compte client

    async def equipe_et_gestion(_db, _pid):
        return [10, 20]

    monkeypatch.setattr(ai.notif, "notifier", notifier)
    monkeypatch.setattr(ai.notif, "ids_gestion", ids_gestion)
    monkeypatch.setattr(ai, "_sans_clients", sans_clients)
    monkeypatch.setattr(ai, "_equipe_et_gestion", equipe_et_gestion)
    return recues


def _projet(fin=None, avancement=0, sante=StatutSante.VERT, retard_le=None, rouge_le=None):
    return SimpleNamespace(id=1, nom="Tennis", date_fin_prevue=fin, avancement_pct=avancement,
                           statut_sante=sante, retard_notifie_le=retard_le, rouge_notifie_le=rouge_le)


def test_projet_en_retard_et_rouge_notifie_une_seule_fois(envois):
    p = _projet(fin=date.today() - timedelta(days=3), sante=StatutSante.ROUGE)
    assert asyncio.run(ai.scanner_projets(_FausseBase([p]))) == 2
    assert {e.type for e in envois} == {"projet_retard", "projet_rouge"}
    assert all(e.ids == [10, 20] for e in envois)
    assert "en retard de 3 jours" in envois[0].message and envois[0].lien == "/projets/1"

    # Second passage : déjà notifié -> rien
    assert asyncio.run(ai.scanner_projets(_FausseBase([p]))) == 0 and len(envois) == 2


def test_projet_rearme_quand_la_situation_disparait(envois):
    p = _projet(fin=date.today() - timedelta(days=1), avancement=100, sante=StatutSante.VERT,
                retard_le="hier", rouge_le="hier")
    assert asyncio.run(ai.scanner_projets(_FausseBase([p]))) == 0
    assert p.retard_notifie_le is None and p.rouge_notifie_le is None and envois == []


def _tache(echeance, rappelee=None, responsable=5):
    return SimpleNamespace(id=7, titre="Maquette", projet_id=1, responsable_id=responsable,
                           statut=StatutTache.EN_COURS, echeance=echeance, echeance_rappelee=rappelee)


def test_rappel_echeance_au_responsable(envois):
    t = _tache(date.today() + timedelta(days=1))
    assert asyncio.run(ai.scanner_echeances(_FausseBase([t]))) == 1
    assert envois[0].ids == [5] and envois[0].type == "deadline_approche"
    assert "demain" in envois[0].message and envois[0].lien == "/taches?projet=1"
    assert t.echeance_rappelee == t.echeance

    # Même échéance : pas de nouveau rappel ; échéance repoussée : nouveau rappel
    assert asyncio.run(ai.scanner_echeances(_FausseBase([t]))) == 0
    t.echeance = date.today()
    assert asyncio.run(ai.scanner_echeances(_FausseBase([t]))) == 1
    assert "aujourd'hui" in envois[-1].message


def test_rappel_echeance_jamais_a_un_client(envois):
    t = _tache(date.today(), responsable=99)
    assert asyncio.run(ai.scanner_echeances(_FausseBase([t]))) == 0 and envois == []


def test_surcharge_notifie_gestion_et_membre(envois, monkeypatch):
    monkeypatch.setattr(settings, "CHARGE_SEUIL_TACHES", 3)
    charge = [
        {"utilisateur_id": 5, "nom": "Ana Test", "taches_ouvertes": 4, "taches_en_retard": 1, "surcharge": True},
        {"utilisateur_id": 6, "nom": "Bob Test", "taches_ouvertes": 1, "taches_en_retard": 0, "surcharge": False},
    ]

    async def charge_par_membre(_db, _ids):
        return charge

    monkeypatch.setattr(ai.charge_service, "charge_par_membre", charge_par_membre)
    ana = SimpleNamespace(id=5, surcharge_notifiee_le=None)
    bob = SimpleNamespace(id=6, surcharge_notifiee_le="avant")  # sorti de surcharge -> réarmé

    db = _FausseBase([1, 2], [bob], [ana])  # projets actifs, marqués, puis le membre en surcharge
    assert asyncio.run(ai.scanner_surcharge(db)) == 1
    assert envois[0].ids == [10, 5] and envois[0].type == "surcharge"
    assert "Ana Test est en surcharge" in envois[0].message
    assert ana.surcharge_notifiee_le is not None and bob.surcharge_notifiee_le is None

    # Déjà notifiée : pas de doublon
    assert asyncio.run(ai.scanner_surcharge(_FausseBase([1, 2], [ana], [ana]))) == 0
