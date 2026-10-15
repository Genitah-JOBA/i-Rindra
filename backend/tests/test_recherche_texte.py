# tests/test_recherche_texte.py — recherche par mots-clés (RF-31)
from datetime import date
from types import SimpleNamespace

from app.services import recherche_texte as rt
from app.services.vecteurs import texte_tache


def test_mots_cles_sans_accents_ni_mots_vides():
    assert rt.mots_cles("Date d'échéance de la tâche") == ["date", "echeance", "tache"]


def test_score_ignore_accents_et_pluriels():
    assert rt.score(["echeance"], "Échéance : 16/09/2026") == 1
    assert rt.score(["tache"], "Liste des tâches en cours") == 1
    assert rt.score(["date", "echeance"], "Date de livraison") == 0.5
    assert rt.score(["cuisine"], "Page d'accueil") == 0


def test_seuil_moitie_des_mots():
    assert rt.seuil(["a"]) == 1
    assert rt.seuil(["a", "b"]) == 0.5
    assert rt.seuil(["a", "b", "c"]) == 2 / 3


def test_les_attributs_d_une_tache_sont_cherchables():
    t = SimpleNamespace(titre="Dashboard", description="", statut="en_revue", priorite="haute",
                        echeance=date(2026, 9, 16))
    texte = texte_tache(t, "Lorraine ANJARASOA")
    cles = rt.mots_cles("date d'échéance")
    assert rt.score(cles, texte) == 1           # « date limite » + « Échéance »
    assert rt.score(rt.mots_cles("en revue"), texte) == 1
    assert rt.score(rt.mots_cles("Lorraine"), texte) == 1


def test_extrait_centre_sur_le_mot_malgre_les_caracteres_speciaux():
    texte = "Préambule – l’agence œuvre " * 10 + "la base de données Firebase" + " suite" * 50
    extrait = rt.extrait_autour(["donnees"], texte, largeur=80)
    assert "données" in extrait
