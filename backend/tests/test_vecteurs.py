# tests/test_vecteurs.py — découpage et dégradation gracieuse de la recherche sémantique (RF-31)
import asyncio

from app.services import vecteurs


def test_decouper_texte_vide():
    assert vecteurs.decouper("") == []
    assert vecteurs.decouper("   \n ") == []


def test_decouper_texte_court_un_seul_passage():
    assert vecteurs.decouper("Créer   la page\nde connexion") == ["Créer la page de connexion"]


def test_decouper_texte_long_passages_bornes_et_chevauchants():
    mots = [f"mot{i}" for i in range(1000)]
    passages = vecteurs.decouper(" ".join(mots))
    assert len(passages) > 1
    assert all(len(p) <= vecteurs.TAILLE_PASSAGE for p in passages)
    # Aucun mot coupé en deux, et le texte entier est couvert
    assert all(set(p.split()) <= set(mots) for p in passages)
    assert passages[0].split()[0] == "mot0"
    assert passages[-1].split()[-1] == "mot999"
    # Chevauchement : la fin d'un passage se retrouve au début du suivant
    assert passages[0].split()[-1] in passages[1].split()


def test_decouper_limite_le_nombre_de_passages():
    passages = vecteurs.decouper("abc " * 100_000)
    assert len(passages) == vecteurs.MAX_PASSAGES_PAR_SOURCE


def test_litteral_format_pgvector():
    assert vecteurs._litteral([0.5, -1, 0.1234567]) == "[0.500000,-1.000000,0.123457]"


def test_recherche_semantique_vide_si_indisponible(monkeypatch):
    """Sans pgvector ni modèle, la recherche sémantique ne renvoie rien (plein texte seul)."""
    monkeypatch.setattr(vecteurs, "_pgvector_ok", False)
    assert vecteurs.disponible() is False
    assert asyncio.run(vecteurs.rechercher_semantique(None, 1, "connexion")) == []
    assert asyncio.run(vecteurs.synchroniser_projet(None, 1)) == 0
