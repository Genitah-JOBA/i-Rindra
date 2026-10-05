# app/besti/schemas.py
"""
Forme des comptes transmis par Besti.

Le webhook et la vérification d'identifiants renvoient la MÊME structure, d'où
un seul schéma pour les deux chemins. Les noms de champs sont ceux de Besti
(camelCase) et sont volontairement conservés tels quels : iRindra ne réécrit
jamais la charge utile d'un partenaire pour qu'elle ressemble à la sienne.

`status` est informatif : iRindra ne l'interprète jamais, Besti ne transmettant
que des clients approuvés. Le rôle, lui, n'est JAMAIS lu depuis Besti : un
compte créé par Besti est toujours un « client » iRindra.
"""
from uuid import UUID

from pydantic import BaseModel, EmailStr


class BestiUser(BaseModel):
    """Compte client déclaré par Besti."""

    bestiId: UUID
    email: EmailStr
    firstName: str
    lastName: str
    companyName: str | None = None
    status: str | None = None