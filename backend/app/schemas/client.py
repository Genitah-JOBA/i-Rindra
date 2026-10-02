# app/schemas/client.py

"""
Schémas Pydantic pour l'entité Client (entreprise / personne cliente).
Distinct du compte utilisateur de rôle 'client'.
"""

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class ClientBase(BaseModel):
    nom: str
    contact: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    # "Ar" = national ; toute autre devise = international
    devise: Optional[str] = "Ar"


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    nom: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    # Pas de 'devise' : elle est fixée à la création et ne change plus
    # (un client en Ar reste en Ar). Un champ 'devise' envoyé est ignoré.


class ClientResponse(ClientBase):
    id: int
    cree_le: Optional[datetime] = None

    model_config = {"from_attributes": True}
