# app/schemas/fichier.py

"""
Schémas Pydantic pour la gestion des fichiers (RF-08).
"""

from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class FichierBase(BaseModel):
    """Base pour les fichiers"""
    nom: str = Field(..., max_length=255)
    type: Optional[str] = Field(None, max_length=100)
    taille: Optional[int] = None

class FichierCreate(BaseModel):
    """Création d'un fichier (upload)"""
    nom: str = Field(..., max_length=255)
    type: Optional[str] = Field(None, max_length=100)
    taille: Optional[int] = None

class FichierResponse(FichierBase):
    """Réponse pour un fichier"""
    id: int
    projet_id: int
    chemin_ou_url: str
    televerse_par_id: Optional[int]
    televerse_par_nom: Optional[str] = None
    cree_le: datetime
    
    model_config = ConfigDict(from_attributes=True)

class FichierListResponse(BaseModel):
    """Réponse simplifiée pour la liste des fichiers"""
    id: int
    nom: str
    type: Optional[str]
    taille: Optional[int]
    televerse_par_id: Optional[int]
    cree_le: datetime
    
    model_config = ConfigDict(from_attributes=True)