# app/schemas/__init__.py

from app.schemas.projet import (
    ProjetBase,
    ProjetCreate,
    ProjetUpdate,
    ProjetResponse,
    ProjetListResponse,
    StatutSanteEnum,
)

from app.schemas.tache import (
    TacheBase,
    TacheCreate,
    TacheUpdate,
    TacheResponse,
    TacheListResponse,
    StatutTacheEnum,
    PrioriteTacheEnum,
    CommentaireTacheCreate,
    CommentaireTacheResponse,
    SaisieTempsCreate,
    SaisieTempsResponse,
)

from app.schemas.dashboard import (
    DashboardProjet,
    DashboardIndicateurs,
    DashboardAlerte,
)

from app.schemas.membre import (
    MembreBase,
    MembreCreate,
    MembreUpdate,
    MembreResponse,
    MembreListResponse,
)

from app.schemas.jalon import (
    JalonBase,
    JalonCreate,
    JalonUpdate,
    JalonResponse,
    JalonListResponse,
)

from app.schemas.fichier import (
    FichierBase,
    FichierCreate,
    FichierResponse,
    FichierListResponse,
)

__all__ = [
    # Projets
    "ProjetBase",
    "ProjetCreate",
    "ProjetUpdate",
    "ProjetResponse",
    "ProjetListResponse",
    "StatutSanteEnum",
    # Tâches
    "TacheBase",
    "TacheCreate",
    "TacheUpdate",
    "TacheResponse",
    "TacheListResponse",
    "StatutTacheEnum",
    "PrioriteTacheEnum",
    "CommentaireTacheCreate",
    "CommentaireTacheResponse",
    "SaisieTempsCreate",
    "SaisieTempsResponse",
    # Dashboard
    "DashboardProjet",
    "DashboardIndicateurs",
    "DashboardAlerte",
    # Membres
    "MembreBase",
    "MembreCreate",
    "MembreUpdate",
    "MembreResponse",
    "MembreListResponse",
    # Jalons
    "JalonBase",
    "JalonCreate",
    "JalonUpdate",
    "JalonResponse",
    "JalonListResponse",

    # Fichiers
    "FichierBase",
    "FichierCreate",
    "FichierResponse",
    "FichierListResponse",
]