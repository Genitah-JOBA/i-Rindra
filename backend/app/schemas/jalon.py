# app/schemas/jalon.py

"""
Schémas Pydantic pour les jalons (RF-07).
"""

from pydantic import BaseModel, Field, ConfigDict
from datetime import date, datetime
from typing import Optional

# ----- SCHÉMAS POUR LES JALONS -----

class JalonBase(BaseModel):
    """Base commune pour tous les jalons"""
    titre: str = Field(..., min_length=1, max_length=200, description="Titre du jalon")
    description: Optional[str] = Field(None, description="Description du jalon")
    echeance: date = Field(..., description="Date d'échéance du jalon")

class JalonCreate(JalonBase):
    """Schéma pour la création d'un jalon"""
    projet_id: int

class JalonUpdate(BaseModel):
    """Schéma pour la mise à jour d'un jalon (tous les champs optionnels)"""
    titre: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    echeance: Optional[date] = None
    atteint: Optional[bool] = None

class JalonResponse(JalonBase):
    """Schéma pour la réponse (lecture d'un jalon)"""
    id: int
    projet_id: int
    atteint: bool
    date_atteint: Optional[datetime]
    cree_le: datetime
    
    model_config = ConfigDict(from_attributes=True)

class JalonListResponse(BaseModel):
    """Schéma pour la liste des jalons (version simplifiée)"""
    id: int
    titre: str
    echeance: date
    atteint: bool
    
    model_config = ConfigDict(from_attributes=True)