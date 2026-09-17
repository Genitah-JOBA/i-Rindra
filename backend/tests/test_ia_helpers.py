# tests/test_ia_helpers.py
"""
Tests unitaires des helpers du service IA (aucune base, aucun appel réseau).

Couvre : parsing JSON (avec fences markdown), sanitisation des enums IA
(priorité, statut, échéance) et stockage du résultat brut.
"""
from datetime import date

from app.services import ia


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