# app/schemas/absence.py
"""
Schémas Pydantic pour la gestion des absences (demande équipe -> validation direction).
"""
from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional
from enum import Enum


class TypeAbsenceEnum(str, Enum):
    CONGE = "conge"
    MALADIE = "maladie"
    PERMISSION = "permission"
    AUTRE = "autre"


class StatutAbsenceEnum(str, Enum):
    EN_ATTENTE = "en_attente"
    ACCEPTEE = "acceptee"
    REFUSEE = "refusee"


# ----- ENTRÉE -----

class AbsenceCreate(BaseModel):
    type: TypeAbsenceEnum = TypeAbsenceEnum.CONGE
    date_debut: date
    date_fin: date
    motif: Optional[str] = Field(None, max_length=255)


class AbsenceDecision(BaseModel):
    """Décision de la direction : accepter ou refuser la demande."""
    statut: StatutAbsenceEnum
    commentaire: Optional[str] = Field(None, max_length=500)


# ----- SORTIE -----

class AbsenceResponse(BaseModel):
    id: int
    utilisateur_id: int
    utilisateur_nom: str = ""            # rempli par le router (jointure)
    utilisateur_prenom: str = ""         # rempli par le router (jointure)
    type: TypeAbsenceEnum
    date_debut: date
    date_fin: date
    motif: Optional[str] = None
    statut: StatutAbsenceEnum
    decideur_id: Optional[int] = None
    decideur_nom: Optional[str] = None   # rempli par le router (jointure)
    commentaire: Optional[str] = None
    cree_le: Optional[datetime] = None
    decide_le: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AbsenceStats(BaseModel):
    en_attente: int
    acceptees: int
    refusees: int
    total: int