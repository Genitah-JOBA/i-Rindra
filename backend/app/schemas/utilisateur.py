# app/schemas/utilisateur.py
"""
Schémas Pydantic pour la gestion des utilisateurs (RF-02).
"""
from app.utils.mots_de_passe import LONGUEUR_MAX, verifier_mot_de_passe
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from datetime import datetime
from typing import Optional


class UtilisateurBase(BaseModel):
    nom: str = Field(..., min_length=1, max_length=100)
    prenom: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    role: str = Field("equipe", description="direction | drh | chef_de_projet | equipe | client")
    metier: Optional[str] = Field(None, description="développeur, graphiste, intégrateur…")
    client_id: Optional[int] = None


class UtilisateurCreate(UtilisateurBase):
    # La politique (longueur, majuscule, chiffre) est validée par le même
    # validateur que le reste de l'application — voir utils/mots_de_passe.py.
    mot_de_passe: str = Field(..., max_length=LONGUEUR_MAX)

    @field_validator("mot_de_passe")
    @classmethod
    def _verifier_mot_de_passe(cls, valeur: str) -> str:
        erreur = verifier_mot_de_passe(valeur)
        if erreur:
            raise ValueError(erreur)
        return valeur


class UtilisateurUpdate(BaseModel):
    nom: Optional[str] = Field(None, min_length=1, max_length=100)
    prenom: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    metier: Optional[str] = None
    client_id: Optional[int] = None
    actif: Optional[bool] = None


class UtilisateurResponse(BaseModel):
    id: int
    nom: str
    prenom: str
    email: str
    role: str
    metier: Optional[str] = None
    client_id: Optional[int] = None
    actif: bool
    cree_le: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
