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
# Extraction de tâches — plafonnement & dédoublonnage (RF-26)
# ============================================================

def test_normaliser_titre_insensible_aux_accents_et_ponctuation():
    assert ia._normaliser_titre("Développer le site") == ia._normaliser_titre("developper le site!")
    assert ia._normaliser_titre("  Créer   une maquette ") == "creer une maquette"
    # Deux tâches réellement différentes ne doivent PAS fusionner.
    assert ia._normaliser_titre("Analyser l'existant") != ia._normaliser_titre("Analyser le site actuel")


def test_extraire_taches_plafonne_et_deduplique(monkeypatch):
    """
    Le vrai symptôme : des dizaines de suggestions, qui s'empilent à chaque clic.

    On vérifie que l'extraction (a) respecte le plafond, (b) écarte les titres
    déjà présents sur le projet, (c) ne crée pas deux fois la même tâche.
    """
    # L'IA renvoie 30 tâches : une partie existe déjà en base, le reste est neuf.
    existantes = {"Developper le site", "Tester le site", "Former les utilisateurs"}
    generees = [{"titre": t, "priorite": "moyenne", "echeance": None}
                for t in list(existantes) + [f"Tache neuve {i}" for i in range(27)]]

    ajoutees = []

    class _ResultatDB:
        def all(self):
            return [(t,) for t in existantes]

    class _DB:
        async def execute(self, _query):
            return _ResultatDB()

        def add(self, obj):
            ajoutees.append(obj)

        async def commit(self):
            pass

    async def _faux_appel_json(*_a, **_k):
        return {"taches": generees}, "modele-test", 999

    async def _faux_entree(*_a, **_k):
        return "cahier des charges", "fichier-1"

    async def _faux_projet(*_a, **_k):
        return SimpleNamespace(
            id=1, nom="Site vitrine", date_debut=date(2026, 1, 1),
            date_fin_prevue=date(2026, 12, 31),
        )

    monkeypatch.setattr(ia, "_projet", _faux_projet)
    monkeypatch.setattr(ia, "_entree_cdc", _faux_entree)
    monkeypatch.setattr(ia, "_appel_json", _faux_appel_json)
    monkeypatch.setattr(ia, "journaliser", _faux_appel_json)

    import asyncio

    res = asyncio.run(ia.extraire_taches(_DB(), 1, texte="cdc"))

    # Plafond respecté
    assert res["nombre_suggestions"] == ia.MAX_SUGGESTIONS
    assert len(ajoutees) == ia.MAX_SUGGESTIONS
    assert res["plafonne"] is True

    # Les 3 titres déjà présents ont été écartés
    assert res["doublons_ignores"] == 3
    titres_ajoutes = [o.titre for o in ajoutees]
    for t in existantes:
        assert t not in titres_ajoutes
    assert len(set(titres_ajoutes)) == len(titres_ajoutes)  # pas de doublon interne


def test_extraire_taches_refuse_si_tout_est_doublon(monkeypatch):
    """Relancer sur un projet déjà traité ne doit pas créer de vague vide."""
    existantes = ["Developper le site", "Tester le site"]

    class _ResultatDB:
        def all(self):
            return [(t,) for t in existantes]

    class _DB:
        async def execute(self, _query):
            return _ResultatDB()

        def add(self, _obj):
            raise AssertionError("rien ne doit être inséré")

        async def commit(self):
            raise AssertionError("rien ne doit être commité")

    async def _faux_appel_json(*_a, **_k):
        return ({"taches": [{"titre": t} for t in existantes]}, "modele-test", 1)

    async def _faux_entree(*_a, **_k):
        return "cdc", None

    async def _faux_projet(*_a, **_k):
        return SimpleNamespace(id=1, nom="P", date_debut=None, date_fin_prevue=None)

    monkeypatch.setattr(ia, "_projet", _faux_projet)
    monkeypatch.setattr(ia, "_entree_cdc", _faux_entree)
    monkeypatch.setattr(ia, "_appel_json", _faux_appel_json)

    import asyncio
    import pytest

    with pytest.raises(ia.ReponseIAInvalideError) as exc:
        asyncio.run(ia.extraire_taches(_DB(), 1, texte="cdc"))
    assert "doublon" in str(exc.value).lower()


# ============================================================
# Réintégration d'une suggestion rejetée (RF-26)
# ============================================================

def _db_avec_suggestion(statut):
    """Faux session DB qui renvoie une SuggestionTache au statut donné."""
    suggestion = SimpleNamespace(
        id=7, titre="Développer le site", projet_id=1,
        statut=statut, tache_id=None,
    )

    class _Res:
        def scalar_one_or_none(self):
            return suggestion

    class _DB:
        def __init__(self):
            self.commits = 0

        async def execute(self, _query):
            return _Res()

        async def commit(self):
            self.commits += 1

    return _DB(), suggestion


def test_restaurer_suggestion_rejetee_repasse_en_attente():
    import asyncio

    db, suggestion = _db_avec_suggestion("rejetee")

    res = asyncio.run(ia.restaurer_suggestion(db, 7))

    assert res["suggestion_id"] == 7
    assert res["statut"] == ia.StatutSuggestion.EN_ATTENTE
    assert db.commits == 1


def test_restaurer_suggestion_refuse_si_pas_rejetee():
    """Une suggestion déjà validée est une vraie Tache : pas de retour arrière."""
    import asyncio
    import pytest

    for statut in ("en_attente", "validee"):
        db, _ = _db_avec_suggestion(statut)
        with pytest.raises(ValueError) as exc:
            asyncio.run(ia.restaurer_suggestion(db, 7))
        assert "rejetée" in str(exc.value)
        assert db.commits == 0  # rien n'est écrit


def test_restaurer_suggestion_inexistante():
    import asyncio
    import pytest

    class _Res:
        def scalar_one_or_none(self):
            return None

    class _DB:
        async def execute(self, _query):
            return _Res()

    with pytest.raises(ValueError) as exc:
        asyncio.run(ia.restaurer_suggestion(_DB(), 999))
    assert "introuvable" in str(exc.value).lower()


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