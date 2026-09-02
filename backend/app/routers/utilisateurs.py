# app/routers/utilisateurs.py
"""
Gestion des utilisateurs (RF-02).
Lecture accessible aux comptes internes (direction/équipe) — utile pour choisir
un responsable ou un membre. Création/modification/suppression réservées à la direction.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.security import hash_password
from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.client import Client
from app.routers.auth import get_current_user_role
from app.schemas import UtilisateurCreate, UtilisateurUpdate, UtilisateurResponse

router = APIRouter(prefix="/utilisateurs", tags=["Utilisateurs"])


async def _direction_seulement(role: str = Depends(get_current_user_role)):
    """Réserve l'action à la direction."""
    if role != "direction":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée à la direction",
        )
    return role


@router.get("/", response_model=List[UtilisateurResponse])
async def get_utilisateurs(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user_role),  # tout compte connecté
):
    """Liste de tous les utilisateurs."""
    result = await db.execute(select(Utilisateur))
    return result.scalars().all()


@router.get("/{utilisateur_id}", response_model=UtilisateurResponse)
async def get_utilisateur(
    utilisateur_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user_role),
):
    """Détail d'un utilisateur."""
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == utilisateur_id)
    )
    utilisateur = result.scalar_one_or_none()
    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur non trouvé"
        )
    return utilisateur


@router.post("/", response_model=UtilisateurResponse, status_code=status.HTTP_201_CREATED)
async def create_utilisateur(
    utilisateur_data: UtilisateurCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_direction_seulement),
):
    """Créer un nouvel utilisateur (direction uniquement)."""
    # Email unique
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.email == utilisateur_data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cet email est déjà utilisé"
        )

    # Rôle valide
    try:
        role_enum = RoleUtilisateur(utilisateur_data.role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rôle invalide. Choisir parmi : {[r.value for r in RoleUtilisateur]}",
        )

    # Règle métier : un 'client' doit être rattaché à un client existant
    if role_enum == RoleUtilisateur.CLIENT:
        if utilisateur_data.client_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un compte 'client' doit être rattaché à un client (client_id requis).",
            )
        res = await db.execute(
            select(Client).where(Client.id == utilisateur_data.client_id)
        )
        if res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Le client id={utilisateur_data.client_id} n'existe pas.",
            )
        client_id_final = utilisateur_data.client_id
    else:
        client_id_final = None

    nouvel_utilisateur = Utilisateur(
        nom=utilisateur_data.nom,
        prenom=utilisateur_data.prenom,
        email=utilisateur_data.email,
        mot_de_passe_hash=hash_password(utilisateur_data.mot_de_passe),
        role=role_enum,
        metier=utilisateur_data.metier,
        client_id=client_id_final,
        actif=True,
    )
    db.add(nouvel_utilisateur)
    await db.commit()
    await db.refresh(nouvel_utilisateur)
    return nouvel_utilisateur


@router.put("/{utilisateur_id}", response_model=UtilisateurResponse)
async def update_utilisateur(
    utilisateur_id: int,
    utilisateur_data: UtilisateurUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_direction_seulement),
):
    """Mettre à jour un utilisateur (direction uniquement)."""
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == utilisateur_id)
    )
    utilisateur = result.scalar_one_or_none()
    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur non trouvé"
        )

    donnees = utilisateur_data.model_dump(exclude_unset=True)
    if "role" in donnees:
        try:
            donnees["role"] = RoleUtilisateur(donnees["role"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Rôle invalide"
            )
    for champ, valeur in donnees.items():
        setattr(utilisateur, champ, valeur)

    await db.commit()
    await db.refresh(utilisateur)
    return utilisateur


@router.delete("/{utilisateur_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_utilisateur(
    utilisateur_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_direction_seulement),
):
    """Supprimer un utilisateur (direction uniquement)."""
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == utilisateur_id)
    )
    utilisateur = result.scalar_one_or_none()
    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur non trouvé"
        )
    await db.delete(utilisateur)
    await db.commit()
    return None
