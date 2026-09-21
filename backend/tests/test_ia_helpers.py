# tests/test_ia_helpers.py
"""
Tests unitaires des helpers du service IA (aucune base, aucun appel réseau).

Couvre : parsing JSON (avec fences markdown), sanitisation des enums IA
(priorité, statut, échéance) et stockage du résultat brut.
"""
from datetime import date
from types import SimpleNamespace

from app.services import ia
from app.models.projet import StatutSante
from app.models.tache import PrioriteTache, StatutTache


def test_json_extraire_simple():
    assert ia._json_extraire('{"a": 1}') == {"a": 1}


def test_json_extraire_avec_fences_markdown():
    reponse = '```json\n{"taches": [{"titre": "Faire X"}]}\n```'
    donnees = ia._json_extraire(reponse)
    assert donnees["taches"][0]["titre"] == "Faire X"


def test_priorite_valide_filtre_les_intrus():
    assert ia._priorite_valide("haute") == "haute"
    assert ia._priorite_valide("basse") == "basse"
    assert ia._priorite_valide("urgente") == "moyenne"  # inconnu -> défaut
    assert ia._priorite_valide(None) == "moyenne"


def test_statut_valide_filtre():
    assert ia._statut_valide("vert") == "vert"
    assert ia._statut_valide("orange") == "orange"
    assert ia._statut_valide("bleu") is None
    assert ia._statut_valide("") is None


def test_echeance_valide_parse_iso_et_rejette():
    assert ia._echeance_valide("2026-10-01") == date(2026, 10, 1)
    assert ia._echeance_valide("2026-10-01T12:00:00") == date(2026, 10, 1)
    assert ia._echeance_valide("pas-une-date") is None
    assert ia._echeance_valide(None) is None


def test_echeance_future_rejette_ou_raccourcit_le_passe():
    # Date future : inchangée
    future = (date.today().replace(year=date.today().year + 1))
    assert ia._echeance_future(future.isoformat()) == future
    # Date passée : ramenée à aujourd'hui
    assert ia._echeance_future("2020-01-01") == date.today()
    # Invalide / absent : None
    assert ia._echeance_future("pas-une-date") is None
    assert ia._echeance_future(None) is None


def test_resultat_brut_json_ou_texte():
    assert ia._resultat_brut('{"cle": "valeur"}') == {"cle": "valeur"}
    # Texte non-JSON : stocké dans un wrapper "reponse"
    brut = ia._resultat_brut("voici le texte brut")
    assert brut["reponse"] == "voici le texte brut"
    assert ia._resultat_brut(None) is None


def test_tronquer_respecte_limite():
    assert ia._tronquer("x" * 100, max_car=10) == "x" * 10
    assert ia._tronquer(None) is None


# ============================================================
# Chat contextuel — rendu du contexte utilisateur
# ============================================================

def _projet_contexte(**kwargs):
    params = dict(
        id=1, nom="Site vitrine", statut_sante=StatutSante.VERT,
        avancement_pct=40, date_debut=date(2026, 1, 1),
        date_fin_prevue=date(2026, 6, 30),
    )
    params.update(kwargs)
    return SimpleNamespace(**params)


def _tache_contexte(**kwargs):
    params = dict(
        id=10, projet_id=1, titre="Intégration",
        statut=StatutTache.EN_COURS, priorite=PrioriteTache.HAUTE,
        echeance=date(2026, 5, 15), responsable_id=2,
    )
    params.update(kwargs)
    return SimpleNamespace(**params)


def test_lignes_contexte_affiche_projet_et_taches():
    projet = _projet_contexte(statut_sante=StatutSante.ORANGE)
    perso = _tache_contexte(echeance=date.today().replace(year=date.today().year + 1))
    en_retard = _tache_contexte(id=11, titre="Recette", echeance=date(2020, 1, 1), responsable_id=99)

    bloc = "\n".join(ia._lignes_contexte([projet], [perso, en_retard], utilisateur_id=2))
    assert "Site vitrine" in bloc
    assert "orange" in bloc
    assert "tâche de l'utilisateur" in bloc
    assert "EN RETARD" in bloc
    assert str(perso.id) in bloc


def test_lignes_contexte_sans_taches():
    projet = _projet_contexte(date_debut=None, date_fin_prevue=None)
    bloc = "\n".join(ia._lignes_contexte([projet], [], utilisateur_id=1))
    assert "0 tâche(s) en cours" in bloc


def test_lignes_contexte_deduplique_les_taches():
    # Une tâche retardée et personnelle ne doit apparaître qu'une seule fois.
    t = _tache_contexte(echeance=date(2020, 1, 1))
    bloc = "\n".join(ia._lignes_contexte([_projet_contexte()], [t], utilisateur_id=2))
    assert bloc.count("EN RETARD") == 0  # déjà listée comme tâche personnelle
    assert bloc.count("#10") == 1