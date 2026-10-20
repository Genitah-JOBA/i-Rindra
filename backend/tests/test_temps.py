# tests/test_temps.py — temps passé agrégé par projet et par membre (RF-24)
import asyncio

from app.services import temps


def test_agregation_par_projet_membre_et_tache():
    lignes = [
        (1, "Site vitrine", 10, "Ana", "Rabe", 100, "Maquette", 90),
        (1, "Site vitrine", 11, "Bob", "Rako", 100, "Maquette", 30),
        (1, "Site vitrine", 10, "Ana", "Rabe", 101, "Intégration", 60),
        (2, "Appli mobile", 11, "Bob", "Rako", 200, "API", 240),
    ]
    res = temps.agreger(lignes)
    assert res["total_min"] == 420
    assert [(p["projet_id"], p["duree_min"]) for p in res["par_projet"]] == [(2, 240), (1, 180)]
    assert [(m["nom"], m["duree_min"]) for m in res["par_membre"]] == [("Bob Rako", 270), ("Ana Rabe", 150)]
    assert res["par_tache"][0] == {"tache_id": 200, "nom": "API", "duree_min": 240}
    assert next(t for t in res["par_tache"] if t["tache_id"] == 100)["duree_min"] == 120


def test_agregation_vide():
    assert temps.agreger([]) == {"total_min": 0, "par_projet": [], "par_membre": [], "par_tache": []}


def test_sans_projet_accessible_aucune_requete():
    class _Base:
        async def execute(self, _q):
            raise AssertionError("aucune requête attendue")

    assert asyncio.run(temps.temps_agrege(_Base(), []))["total_min"] == 0
