# app/schemas/fichier.py

"""
Schémas Pydantic pour la gestion des fichiers (RF-08).

Les noms de champs correspondent au modèle SQLAlchemy `Fichier`
(type_mime / taille_octets / televerse_par) et donc aux tables
créées dans schema.sql et schema_o2switch.sql.
"""

from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

class FichierBase(BaseModel):
    """Base pour les fichiers"""
    nom: str = Field(..., max_length=255)
    type_mime: Optional[str] = Field(None, max_length=100)
    taille_octets: Optional[int] = None

class FichierCreate(FichierBase):
    """Création d'un fichier (upload)"""
    pass

class FichierResponse(FichierBase):
    """Réponse pour un fichier"""
    id: int
    projet_id: int
    chemin_ou_url: str
    televerse_par: Optional[int]
    televerse_par_nom: Optional[str] = None
    cree_le: datetime

    model_config = ConfigDict(from_attributes=True)

class FichierListResponse(BaseModel):
    """Réponse simplifiée pour la liste des fichiers"""
    id: int
    nom: str
    type_mime: Optional[str]
    taille_octets: Optional[int]
    televerse_par: Optional[int]
    televerse_par_nom: Optional[str] = None
    cree_le: datetime

    model_config = ConfigDict(from_attributes=True)