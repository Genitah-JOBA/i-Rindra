# app/schemas/suggestion_devis.py

"""
Schémas Pydantic pour les suggestions de devis générées par l'IA.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from enum import Enum


class StatutSuggestionDevisEnum(str, Enum):
    EN_ATTENTE = "en_attente"
    VALIDEE = "validee"
    REFUSEE = "refusee"


class SuggestionDevisIARequest(BaseModel):
    """Génération d'un devis par l'IA (volet financier)."""
    client_id: int = Field(..., description="Client concerné (obligatoire)")
    projet_id: int = Field(..., description="Projet concerné (obligatoire)")
    titre: Optional[str] = Field(None, max_length=200, description="Titre libre du devis")
    demande: str = Field(..., min_length=3, max_length=4000, description="Prestation / contexte du devis à générer")


class SuggestionDevisCreate(BaseModel):
    """Création directe (sauvegarde d'une réponse IA déjà produite)."""
    client_id: Optional[int] = None
    projet_id: Optional[int] = None
    titre: Optional[str] = Field(None, max_length=200)
    demande: Optional[str] = None
    contenu_devis: str = Field(..., min_length=1)
    modele: Optional[str] = None


class SuggestionDevisStatutUpdate(BaseModel):
    """Changement de statut (valider / refuser)."""
    statut: StatutSuggestionDevisEnum


class SuggestionDevisResponse(BaseModel):
    """Réponse de lecture d'une suggestion de devis."""
    id: int
    client_id: Optional[int] = None
    client_nom: Optional[str] = None
    projet_id: Optional[int] = None
    projet_nom: Optional[str] = None
    titre: Optional[str] = None
    demande: Optional[str] = None
    contenu_devis: str
    statut: StatutSuggestionDevisEnum
    modele: Optional[str] = None
    cree_par: Optional[int] = None
    cree_le: datetime

    model_config = {"from_attributes": True}