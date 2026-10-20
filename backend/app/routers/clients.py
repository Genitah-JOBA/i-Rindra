# app/routers/clients.py
"""
Gestion des clients / entreprises clientes (entité métier).
Lecture : tout compte interne. Création/modif/suppression : direction ou chef de projet.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.models.client import Client
from app.models.utilisateur import Utilisateur
from app.routers.auth import get_current_user_role
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse

router = APIRouter(prefix="/clients", tags=["Clients"])


async def _interne_seulement(role: str = Depends(get_current_user_role)):
    if role not in ("direction", "drh", "chef_de_projet", "equipe"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée aux comptes internes",
        )
    return role


@router.get("/", response_model=List[ClientResponse])
async def get_clients(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user_role),
    actifs_seulement: bool = Query(
        False,
        description="Masque les clients retirés de Besti (compte lié supprimé ou désactivé)",
    ),
):
    """
    Liste des clients.

    Un client supprimé dans Besti arrive en `user.deactivated` : son compte lié
    est désactivé et ses projets archivés, mais la fiche est conservée (projets,
    factures). `actifs_seulement=true` la masque de la liste (écran Clients) ;
    elle réapparaît si Besti réactive le compte.
    """
    q = select(Client).order_by(Client.nom)
    if actifs_seulement:
        lie_inactif = select(Utilisateur.client_id).where(
            Utilisateur.besti_id.is_not(None),
            Utilisateur.client_id.is_not(None),  # NOT IN sur un NULL ne renverrait rien
            Utilisateur.actif == False,  # noqa: E712
        )
        actif = select(Utilisateur.client_id).where(
            Utilisateur.client_id.is_not(None), Utilisateur.actif == True  # noqa: E712
        )
        q = q.where(Client.id.not_in(lie_inactif) | Client.id.in_(actif))
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user_role),
):
    """Détail d'un client."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    return client


@router.post("/", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    client_data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_interne_seulement),
):
    """Créer un client."""
    nouveau = Client(**client_data.model_dump())
    db.add(nouveau)
    await db.commit()
    await db.refresh(nouveau)
    return nouveau


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: int,
    client_data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_interne_seulement),
):
    """Mettre à jour un client."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    for champ, valeur in client_data.model_dump(exclude_unset=True).items():
        setattr(client, champ, valeur)
    await db.commit()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_interne_seulement),
):
    """Supprimer un client."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    await db.delete(client)
    await db.commit()
    return None
