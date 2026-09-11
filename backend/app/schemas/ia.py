# app/schemas/ia.py

"""
Schémas Pydantic pour le module IA (statut, ping, chat).
"""

from pydantic import BaseModel, Field
from typing import Optional, List


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


class ChatMessage(BaseModel):
    """Un message dans l'historique de conversation."""
    role: str = Field(..., description="'user' ou 'assistant'")
    content: str


class ChatRequest(BaseModel):
    """Requête de chat envoyée par le frontend."""
    message: str = Field(..., min_length=1, max_length=4000)
    historique: Optional[List[ChatMessage]] = Field(
        default=None,
        description="Historique de conversation (max 20 derniers messages)",
    )


class ChatResponse(BaseModel):
    """Réponse du chat IA."""
    reponse: str
    modele: str
    tokens: Optional[int] = None