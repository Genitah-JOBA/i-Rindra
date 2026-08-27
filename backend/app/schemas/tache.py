# app/schemas/tache.py

"""
Schémas Pydantic pour les tâches (validation des données).
"""

from pydantic import BaseModel, Field, ConfigDict
from datetime import date, datetime
from typing import Optional
from enum import Enum

# Enums pour la validation
class StatutTacheEnum(str, Enum):
    A_FAIRE = "a_faire"
    EN_COURS = "en_cours"
    EN_REVUE = "en_revue"
    TERMINE = "termine"

class PrioriteTacheEnum(str, Enum):
    BASSE = "basse"
    MOYENNE = "moyenne"
    HAUTE = "haute"

# ----- SCHÉMAS POUR LES TÂCHES -----

class TacheBase(BaseModel):
    """Base commune pour toutes les tâches"""
    titre: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    responsable_id: Optional[int] = None
    echeance: Optional[date] = None
    priorite: PrioriteTacheEnum = PrioriteTacheEnum.MOYENNE

class TacheCreate(TacheBase):
    """Schéma pour la création d'une tâche"""
    projet_id: int
    statut: Optional[StatutTacheEnum] = StatutTacheEnum.A_FAIRE

class TacheUpdate(BaseModel):
    """Schéma pour la mise à jour d'une tâche (tous les champs optionnels)"""
    titre: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    statut: Optional[StatutTacheEnum] = None
    priorite: Optional[PrioriteTacheEnum] = None
    echeance: Optional[date] = None
    responsable_id: Optional[int] = None
    ordre: Optional[int] = None

class TacheResponse(TacheBase):
    """Schéma pour la réponse (lecture d'une tâche)"""
    id: int
    projet_id: int
    statut: StatutTacheEnum
    ordre: int
    cree_le: datetime
    
    model_config = ConfigDict(from_attributes=True)

class TacheListResponse(BaseModel):
    """Schéma pour la liste des tâches (version simplifiée)"""
    id: int
    titre: str
    statut: StatutTacheEnum
    priorite: PrioriteTacheEnum
    responsable_id: Optional[int]
    echeance: Optional[date]
    ordre: int
    
    model_config = ConfigDict(from_attributes=True)

# ----- SCHÉMAS POUR LES COMMENTAIRES -----

class CommentaireTacheBase(BaseModel):
    contenu: str = Field(..., min_length=1)

class CommentaireTacheCreate(CommentaireTacheBase):
    pass

class CommentaireTacheResponse(CommentaireTacheBase):
    id: int
    tache_id: int
    utilisateur_id: int
    cree_le: datetime
    
    model_config = ConfigDict(from_attributes=True)

# ----- SCHÉMAS POUR LE SUIVI DU TEMPS -----

class SaisieTempsBase(BaseModel):
    duree_min: float = Field(..., gt=0, description="Durée en minutes")
    date: Optional[date] = None
    note: Optional[str] = Field(None, max_length=500)

class SaisieTempsCreate(SaisieTempsBase):
    tache_id: int

class SaisieTempsResponse(SaisieTempsBase):
    id: int
    tache_id: int
    utilisateur_id: int
    cree_le: datetime
    
    model_config = ConfigDict(from_attributes=True)