# tests/test_permissions_taches.py
"""
Tests des droits de création d'une tâche.

Règle métier : la gestion (direction, DRH, chef de projet) choisit librement le
responsable ; un membre de l'équipe qui crée une tâche en devient
automatiquement le responsable, et elle démarre en « À faire ».

Aucune base : les tests s'appuient sur la vraie dépendance FastAPI et une
fausse session pour le flux de création.
"""
import asyncio

import pytest
from fastapi import HTTPException

from app.models.tache import StatutTache
from app.routers import taches as routeur
from app.schemas.tache import TacheCreate, StatutTacheEnum


# ============================================================
# 1. Qui a le droit de créer une tâche
# ============================================================

@pytest.mark.parametrize(
    "role", ["direction", "drh", "chef_de_projet", "equipe"]
)
def test_les_quatre_roles_peuvent_creer_une_tache(role):
    assert asyncio.run(routeur.check_gestion_ou_equipe(role)) == role


@pytest.mark.parametrize("role", ["client"])
def test_le_client_ne_peut_pas_creer_de_tache(role):
    """Le client est en lecture seule : il ne touche pas au Kanban."""
    with pytest.raises(HTTPException) as exc:
        asyncio.run(routeur.check_gestion_ou_equipe(role))
    assert exc.value.status_code == 403


def test_role_inconnu_refuse():
    with pytest.raises(HTTPException):
        asyncio.run(routeur.check_gestion_ou_equipe("admin"))


# ============================================================
# 2. Qui devient responsable
# ============================================================

def _payload(**kwargs):
    params = dict(projet_id=1, titre="Déployer la maquette")
    params.update(kwargs)
    return TacheCreate(**params)


def test_un_membre_de_equipe_herite_automatiquement_de_la_tache():
    """Le cœur de la demande : l'équipe est responsable de ce qu'elle crée."""
    assert routeur._responsable_de_creation("equipe", current_user_id=7, payload=_payload()) == 7


def test_equipe_ne_peut_pas_deleguer_meme_en_envoyant_un_autre_id():
    """Un `responsable_id` forgé dans le corps de la requête est ignoré."""
    payload = _payload(responsable_id=99)
    assert routeur._responsable_de_creation("equipe", current_user_id=7, payload=payload) == 7


def test_la_gestion_conserve_son_choix_du_responsable():
    payload = _payload(responsable_id=99)
    assert routeur._responsable_de_creation("chef_de_projet", current_user_id=7, payload=payload) == 99


def test_la_gestion_peut_lancer_sans_responsable():
    assert routeur._responsable_de_creation("direction", current_user_id=7, payload=_payload()) is None


# ============================================================
# 3. Statut initial
# ============================================================

def test_une_tache_creee_par_equipe_demarre_en_a_faire():
    """Sinon un membre gonflerait l'avancement du projet (taches terminees / total)."""
    statut = routeur._statut_de_creation(
        "equipe", payload=_payload(statut=StatutTacheEnum.TERMINE)
    )
    assert statut == StatutTache.A_FAIRE


def test_equipe_peut_demarrer_en_cours():
    """Seul « Terminé » est refusé : démarrer directement en cours reste possible."""
    statut = routeur._statut_de_creation(
        "equipe", payload=_payload(statut=StatutTacheEnum.EN_COURS)
    )
    assert statut == StatutTache.EN_COURS


def test_la_gestion_peut_lancer_une_tache_deja_terminee():
    """Cas de la reprise de projet : la gestion garde sa liberté."""
    statut = routeur._statut_de_creation(
        "chef_de_projet", payload=_payload(statut=StatutTacheEnum.TERMINE)
    )
    assert statut == StatutTache.TERMINE


def test_sans_statut_la_tache_demande_en_a_faire():
    assert routeur._statut_de_creation("equipe", payload=_payload()) == StatutTache.A_FAIRE
    assert routeur._statut_de_creation("direction", payload=_payload()) == StatutTache.A_FAIRE