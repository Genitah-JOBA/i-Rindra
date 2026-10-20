# app/besti/schemas_projet.py
"""
Forme des projets transmis par Besti (événements `project.*`).

Comme pour les comptes, les noms de champs sont ceux de Besti (camelCase) et
sont conservés tels quels. Les champs inconnus sont ignorés : Besti peut
enrichir sa charge utile sans casser la liaison.

Les statuts ne sont PAS une liste fermée : Besti les calcule et peut en ajouter.
iRindra affiche `label` et garde `code` pour trier / colorer.
"""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class BestiStatut(BaseModel):
    code: str
    label: str
    since: datetime | None = None


class BestiFichierInfo(BaseModel):
    fileId: UUID
    name: str
    mimeType: str | None = None
    sizeBytes: int | None = None
    addedAt: datetime | None = None


class BestiLienInfo(BaseModel):
    linkId: UUID
    url: str
    label: str | None = None
    provider: str | None = None


class BestiCahierInfo(BaseModel):
    specificationId: UUID
    title: str
    description: str | None = None
    submittedOn: date | None = None
    status: BestiStatut | None = None
    files: list[BestiFichierInfo] = []
    links: list[BestiLienInfo] = []


class BestiAffectation(BaseModel):
    """Membre de l'agence affecté au projet dans Besti (assignments)."""

    email: str
    firstName: str | None = None
    lastName: str | None = None
    assignedAt: datetime | None = None


class BestiProjetInstantane(BaseModel):
    """Corps de `project.created` / `project.updated` : instantané COMPLET."""

    projectId: UUID
    bestiId: UUID
    name: str
    description: str | None = None
    createdOn: date | None = None
    desiredDeadline: date | None = None
    status: BestiStatut
    updatedAt: datetime
    specifications: list[BestiCahierInfo] = []
    # Affectations de l'équipe. Absent (None) : Besti ne les transmet pas, l'équipe
    # iRindra n'est pas touchée ; liste vide : plus personne n'est affecté.
    team: list[BestiAffectation] | None = None


class BestiProjetSupprime(BaseModel):
    """Corps de `project.deleted`."""

    projectId: UUID
    bestiId: UUID
    deletedAt: datetime
