# app/schemas/facture.py

from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional
from enum import Enum


class StatutFactureEnum(str, Enum):
    BROUILLON = "brouillon"
    ENVOYEE = "envoyee"
    PAYEE = "payee"
    EN_RETARD = "en_retard"
    ANNULEE = "annulee"


# ----- ENTRÉE -----

class FactureBase(BaseModel):
    client_id: int
    projet_id: Optional[int] = None
    date_emission: Optional[date] = None      # défaut = aujourd'hui (côté serveur)
    date_echeance: Optional[date] = None
    montant_ht: float = Field(..., ge=0)
    taux_tva: float = Field(20, ge=0, le=100)
    notes: Optional[str] = None


class FactureCreate(FactureBase):
    pass


class FactureUpdate(BaseModel):
    """Mise à jour partielle : tous les champs sont optionnels."""
    client_id: Optional[int] = None
    projet_id: Optional[int] = None
    date_emission: Optional[date] = None
    date_echeance: Optional[date] = None
    montant_ht: Optional[float] = Field(None, ge=0)
    taux_tva: Optional[float] = Field(None, ge=0, le=100)
    statut: Optional[StatutFactureEnum] = None
    notes: Optional[str] = None


class StatutUpdate(BaseModel):
    statut: StatutFactureEnum


# ----- SORTIE -----

class FactureResponse(BaseModel):
    id: int
    numero: str
    client_id: int
    projet_id: Optional[int] = None
    client_nom: Optional[str] = None          # rempli par le router (jointure)
    projet_nom: Optional[str] = None          # rempli par le router (jointure)
    statut: StatutFactureEnum
    date_emission: date
    date_echeance: Optional[date] = None
    montant_ht: float
    taux_tva: float
    montant_tva: float
    montant_ttc: float
    notes: Optional[str] = None
    cree_le: datetime

    class Config:
        from_attributes = True


class FactureStats(BaseModel):
    total_factures: int
    ca_encaisse: float     # somme TTC des factures PAYÉES
    en_attente: float      # somme TTC des factures ENVOYÉES + EN RETARD
    brouillons: int        # nombre de brouillons
    impayees: int          # nombre de factures envoyées + en retard
