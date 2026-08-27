# app/schemas/projet.py

from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional, List
from enum import Enum

# Enum pour la validation
class StatutSanteEnum(str, Enum):
    VERT = "vert"
    ORANGE = "orange"
    ROUGE = "rouge"

# ----- SCHÉMAS POUR LES PROJETS -----

class ProjetBase(BaseModel):
    """Base commune pour tous les schémas de projet"""
    nom: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    client_id: int
    responsable_id: int
    date_debut: Optional[date] = None
    date_fin_prevue: Optional[date] = None

class ProjetCreate(ProjetBase):
    """Schéma pour la création d'un projet"""
    pass

class ProjetUpdate(BaseModel):
    """Schéma pour la mise à jour d'un projet (tous les champs optionnels)"""
    nom: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    client_id: Optional[int] = None
    responsable_id: Optional[int] = None
    date_debut: Optional[date] = None
    date_fin_prevue: Optional[date] = None
    statut_sante: Optional[StatutSanteEnum] = None
    archive: Optional[bool] = None

class ProjetResponse(ProjetBase):
    """Schéma pour la réponse (lecture)"""
    id: int
    statut_sante: StatutSanteEnum
    avancement_pct: float
    archive: bool
    cree_le: datetime
    
    class Config:
        from_attributes = True  # Permet de convertir l'ORM en Pydantic

class ProjetListResponse(BaseModel):
    """Schéma pour la liste des projets (version simplifiée)"""
    id: int
    nom: str
    client_id: int
    responsable_id: int
    statut_sante: StatutSanteEnum
    avancement_pct: float
    archive: bool
    
    class Config:
        from_attributes = True