# app/schemas/utilisateur.py
"""
Schémas Pydantic pour la gestion des utilisateurs (RF-02).
"""
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional


class UtilisateurBase(BaseModel):
    nom: str = Field(..., min_length=1, max_length=100)
    prenom: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    role: str = Field("equipe", description="direction | equipe | client")
    client_id: Optional[int] = None


class UtilisateurCreate(UtilisateurBase):
    mot_de_passe: str = Field(..., min_length=4)


class UtilisateurUpdate(BaseModel):
    nom: Optional[str] = Field(None, min_length=1, max_length=100)
    prenom: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    client_id: Optional[int] = None
    actif: Optional[bool] = None


class UtilisateurResponse(BaseModel):
    id: int
    nom: str
    prenom: str
    email: str
    role: str
    client_id: Optional[int] = None
    actif: bool
    cree_le: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
