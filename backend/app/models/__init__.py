# models/__init__.py
# Importe tous les modèles pour qu'ils soient enregistrés sur Base.metadata
# (indispensable pour que create_all() crée toutes les tables).

from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.client import Client
from app.models.projet import Projet, ProjetMembre, StatutSante
from app.models.tache import Tache, CommentaireTache, StatutTache, PrioriteTache
from app.models.jalon import Jalon
from app.models.fichier import Fichier
from app.models.saisie_temps import SaisieTemps
from app.models.analyse_ia import (
    AnalyseIA,
    SuggestionTache,
    TypeAnalyseIA,
    StatutSuggestion,
)

__all__ = [
    "Utilisateur",
    "RoleUtilisateur",
    "Client",
    "Projet",
    "StatutSante",
    "ProjetMembre",
    "Tache",
    "StatutTache",
    "PrioriteTache",
    "CommentaireTache",
    "SaisieTemps",
]
