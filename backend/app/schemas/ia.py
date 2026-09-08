# app/schemas/ia.py

"""
Schémas Pydantic pour le module IA (statut, ping de test).
"""

from pydantic import BaseModel
from typing import Optional


class IaStatus(BaseModel):
    """État de la configuration IA, sans appel réseau."""
    configuree: bool
    modele: str


class IaPing(BaseModel):
    """Réponse du test de bout en bout vers OpenAI."""
    ok: bool
    reponse: str
    modele: str
    tokens: Optional[int] = None