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


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    nom: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None


class ClientResponse(ClientBase):
    id: int
    cree_le: Optional[datetime] = None

    model_config = {"from_attributes": True}
