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
]