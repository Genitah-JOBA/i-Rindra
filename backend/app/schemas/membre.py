# app/schemas/membre.py

"""
Schémas Pydantic pour la gestion des membres d'équipe (RF-06, RF-13).
"""

from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class MembreBase(BaseModel):
    """Base pour les membres"""
    utilisateur_id: int = Field(..., description="ID de l'utilisateur")
    role_dans_projet: Optional[str] = Field(None, description="Rôle dans le projet (ex: développeur, designer)")

class MembreCreate(MembreBase):
    """Création d'un membre"""
    pass

class MembreUpdate(BaseModel):
    """Mise à jour d'un membre"""
    role_dans_projet: Optional[str] = Field(None, description="Nouveau rôle dans le projet")

class MembreResponse(BaseModel):
    """Réponse complète pour un membre"""
    id: int
    projet_id: int
    utilisateur_id: int
    nom: str
    prenom: str
    email: str
    role_global: str  # direction, equipe, client
    metier: Optional[str] = None  # métier du membre (dev, graphiste…)
    role_dans_projet: Optional[str]
    est_responsable: bool = False
    message: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class MembreListResponse(BaseModel):
    """Réponse simplifiée pour la liste des membres"""
    id: int
    projet_id: int
    utilisateur_id: int
    nom: str
    prenom: str
    email: str
    role_global: str
    metier: Optional[str] = None
    role_dans_projet: Optional[str]
    est_responsable: bool = False
    cree_le: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)