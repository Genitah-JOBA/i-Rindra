# app/models/__init__.py

from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.client import Client
from app.models.projet import Projet, ProjetMembre, StatutSante
from app.models.tache import Tache, StatutTache, PrioriteTache, CommentaireTache
from app.models.saisie_temps import SaisieTemps
from app.models.jalon import Jalon
from app.models.fichier import Fichier
from app.models.notification import Notification
from app.models.facture import Facture, StatutFacture
from app.models.analyse_ia import AnalyseIA, SuggestionTache, TypeAnalyseIA, StatutSuggestion
from app.models.absence import Absence, TypeAbsence, StatutAbsence

__all__ = [
    "Utilisateur",
    "RoleUtilisateur",
    "Client",
    "Projet",
    "ProjetMembre",
    "StatutSante",
    "Tache",
    "StatutTache",
    "PrioriteTache",
    "CommentaireTache",
    "SaisieTemps",
    "Jalon",
    "Fichier",
    "Notification",
    "Facture",
    "StatutFacture",
    "AnalyseIA",
    "SuggestionTache",
    "TypeAnalyseIA",
    "StatutSuggestion",
    "Absence",
    "TypeAbsence",
    "StatutAbsence",
]