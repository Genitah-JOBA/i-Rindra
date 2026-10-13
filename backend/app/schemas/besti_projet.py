# app/schemas/besti_projet.py
"""
Réponses de lecture des projets Besti pour le client connecté.

Les identifiants exposés sont les identifiants publics Besti (UUID) : jamais
d'id interne, ni d'adresse de fichier chez Besti (le téléchargement passe par
iRindra), et aucun montant (le contrat n'en transmet pas).
"""
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class BestiStatutResponse(BaseModel):
    code: str
    libelle: str
    depuis: Optional[datetime] = None


class BestiProjetResume(BaseModel):
    """Ligne de liste : projet actif ou archivé."""

    id: UUID
    nom: str
    cree_le: Optional[date] = None
    echeance_souhaitee: Optional[date] = None
    statut: BestiStatutResponse
    maj_le: datetime
    archive_le: Optional[datetime] = None
    # `supprime_besti` | `compte_desactive` | None
    motif_archivage: Optional[str] = None


class BestiFichierResponse(BaseModel):
    id: UUID
    nom: str
    type_mime: Optional[str] = None
    taille_octets: Optional[int] = None
    ajoute_le: Optional[datetime] = None


class BestiLienResponse(BaseModel):
    id: UUID
    url: str
    libelle: Optional[str] = None
    fournisseur: Optional[str] = None


class BestiCahierResponse(BaseModel):
    id: UUID
    titre: str
    description: Optional[str] = None
    soumis_le: Optional[date] = None
    statut: Optional[BestiStatutResponse] = None
    fichiers: list[BestiFichierResponse] = []
    liens: list[BestiLienResponse] = []


class BestiProjetDetail(BestiProjetResume):
    """Détail : informations, statut courant, historique complet, cahiers."""

    description: Optional[str] = None
    historique: list[BestiStatutResponse] = []
    cahiers: list[BestiCahierResponse] = []
