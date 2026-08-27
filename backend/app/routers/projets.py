# app/routers/projets.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from typing import List, Optional

from app.core.database import get_db
from app.core.security import decode_access_token
from app.routers.auth import oauth2_scheme, get_current_user_id, get_current_user_role
from app.models.projet import Projet, ProjetMembre, StatutSante
from app.models.client import Client
from app.models.utilisateur import Utilisateur
from app.schemas.projet import ProjetCreate, ProjetUpdate, ProjetResponse, ProjetListResponse

router = APIRouter(prefix="/projets", tags=["Projets"])

# ----- DÉPENDANCES DE PERMISSIONS -----

async def check_direction_or_chef_projet(role: str = Depends(get_current_user_role)):
    """
    Vérifie que l'utilisateur est direction ou chef de projet.
    À utiliser pour les actions de gestion (création, modification, suppression).
    """
    if role not in ["direction", "equipe"]:  # equipe = chef de projet dans notre modèle
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul la direction ou le chef de projet peut effectuer cette action"
        )
    return role


async def check_projet_access(
    projet_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Projet:
    """
    Vérifie que l'utilisateur connecté a le droit d'accéder au projet `projet_id`,
    et renvoie le projet.

    Règles (RF-03, RF-22) :
      - direction : accès à tout
      - equipe (chef de projet) : responsable OU membre du projet
      - client : uniquement le projet de son client_id

    Peut aussi être appelée en interne avec `token=None` : dans ce cas on ne
    revalide pas le rôle (l'appelant a déjà authentifié) et on se contente de
    vérifier que le projet existe.
    """
    # 1. Récupère le projet
    result = await db.execute(select(Projet).where(Projet.id == projet_id))
    projet = result.scalar_one_or_none()
    if not projet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projet non trouvé",
        )

    # 2. Appel interne sans token : on ne vérifie que l'existence
    if token is None:
        return projet

    # 3. Vérifie les permissions selon le rôle
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")

    if role == "direction":
        return projet

    if role == "equipe":
        if projet.responsable_id == user_id:
            return projet
        membre = await db.execute(
            select(ProjetMembre).where(
                ProjetMembre.projet_id == projet_id,
                ProjetMembre.utilisateur_id == user_id,
            )
        )
        if membre.scalar_one_or_none() is not None:
            return projet

    if role == "client" and projet.client_id == client_id:
        return projet

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Vous n'avez pas accès à ce projet",
    )

# ----- ENDPOINTS -----

@router.get("/", response_model=List[ProjetListResponse])
async def get_projets(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    archive: Optional[bool] = Query(None, description="Filtrer par archive"),
    statut: Optional[StatutSante] = Query(None, description="Filtrer par statut de santé")
):
    """
    Récupère la liste des projets.
    - Direction : voit tous les projets
    - Chef de projet : voit les projets où il est responsable ou membre
    - Client : voit uniquement son projet (via l'espace client)
    """
    # 1. Récupère l'utilisateur et son rôle
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")
    
    # 2. Construction de la requête
    query = select(Projet)
    
    # 3. Filtrage selon le rôle
    if role == "direction":
        # Direction : voit tout
        pass
    elif role == "equipe":
        # Chef de projet : voit ses projets
        # Ici, on simplifie : on montre les projets où il est responsable
        # Plus tard, on pourra ajouter les projets où il est membre
        query = query.where(
            (Projet.responsable_id == user_id) | 
            (Projet.id.in_(select(ProjetMembre.projet_id).where(ProjetMembre.utilisateur_id == user_id)))
        )
    elif role == "client":
        # Client : ne voit que son projet
        if client_id:
            query = query.where(Projet.client_id == client_id)
        else:
            # Un client sans client_id ne devrait pas arriver
            return []
    
    # 4. Filtres optionnels
    if archive is not None:
        query = query.where(Projet.archive == archive)
    
    if statut:
        query = query.where(Projet.statut_sante == statut)
    
    # 5. Exécution de la requête
    result = await db.execute(query)
    projets = result.scalars().all()
    
    # 6. Conversion en réponse
    return [ProjetListResponse.model_validate(p) for p in projets]

@router.get("/{projet_id}", response_model=ProjetResponse)
async def get_projet(
    projet_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    """
    Récupère les détails d'un projet spécifique.
    Vérifie les permissions selon le rôle.
    """
    # 1. Récupère l'utilisateur
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")
    
    # 2. Récupère le projet
    result = await db.execute(
        select(Projet).where(Projet.id == projet_id)
    )
    projet = result.scalar_one_or_none()
    
    if not projet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projet non trouvé"
        )
    
    # 3. Vérifie les permissions
    if role == "direction":
        # Direction : peut voir tout
        pass
    elif role == "equipe":
        # Chef de projet : ne voit que ses projets
        if projet.responsable_id != user_id:
            # TODO: Vérifier si l'utilisateur est membre du projet
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous n'avez pas accès à ce projet"
            )
    elif role == "client":
        # Client : ne voit que son projet
        if projet.client_id != client_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous n'avez pas accès à ce projet"
            )
    
    return ProjetResponse.model_validate(projet)

@router.post("/", response_model=ProjetResponse, status_code=status.HTTP_201_CREATED)
async def create_projet(
    projet_data: ProjetCreate,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)  # Vérifie les permissions
):
    """
    Crée un nouveau projet.
    Seule la direction ou le chef de projet peut créer un projet.
    """
    # 1. Vérifie que le client existe
    result = await db.execute(
        select(Client).where(Client.id == projet_data.client_id)
    )
    client = result.scalar_one_or_none()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client non trouvé"
        )
    
    # 2. Vérifie que le responsable existe
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == projet_data.responsable_id)
    )
    responsable = result.scalar_one_or_none()
    
    if not responsable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Responsable non trouvé"
        )
    
    # 3. Crée le projet
    new_projet = Projet(
        nom=projet_data.nom,
        description=projet_data.description,
        client_id=projet_data.client_id,
        responsable_id=projet_data.responsable_id,
        date_debut=projet_data.date_debut,
        date_fin_prevue=projet_data.date_fin_prevue,
        statut_sante=StatutSante.VERT,  # Par défaut
        avancement_pct=0.0,  # Par défaut
        archive=False,
    )
    
    db.add(new_projet)
    await db.commit()
    await db.refresh(new_projet)
    
    return ProjetResponse.model_validate(new_projet)

@router.put("/{projet_id}", response_model=ProjetResponse)
async def update_projet(
    projet_id: int,
    projet_data: ProjetUpdate,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Met à jour un projet existant.
    Seule la direction ou le chef de projet peut modifier un projet.
    """
    # 1. Récupère le projet
    result = await db.execute(
        select(Projet).where(Projet.id == projet_id)
    )
    projet = result.scalar_one_or_none()
    
    if not projet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projet non trouvé"
        )
    
    # 2. Met à jour les champs
    update_data = projet_data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(projet, key, value)
    
    # 3. Sauvegarde
    await db.commit()
    await db.refresh(projet)
    
    return ProjetResponse.model_validate(projet)

@router.delete("/{projet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_projet(
    projet_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Supprime un projet (suppression définitive).
    Seule la direction ou le chef de projet peut supprimer un projet.
    """
    # 1. Récupère le projet
    result = await db.execute(
        select(Projet).where(Projet.id == projet_id)
    )
    projet = result.scalar_one_or_none()
    
    if not projet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projet non trouvé"
        )
    
    # 2. Supprime le projet
    await db.delete(projet)
    await db.commit()
    
    return None

@router.post("/{projet_id}/archiver", response_model=ProjetResponse)
async def archiver_projet(
    projet_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Archive un projet (soft delete).
    Seule la direction ou le chef de projet peut archiver un projet.
    """
    # 1. Récupère le projet
    result = await db.execute(
        select(Projet).where(Projet.id == projet_id)
    )
    projet = result.scalar_one_or_none()
    
    if not projet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projet non trouvé"
        )
    
    # 2. Archive le projet
    projet.archive = True
    await db.commit()
    await db.refresh(projet)
    
    return ProjetResponse.model_validate(projet)

@router.post("/{projet_id}/desarchiver", response_model=ProjetResponse)
async def desarchiver_projet(
    projet_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Désarchive un projet.
    """
    # 1. Récupère le projet
    result = await db.execute(
        select(Projet).where(Projet.id == projet_id)
    )
    projet = result.scalar_one_or_none()
    
    if not projet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projet non trouvé"
        )
    
    # 2. Désarchive le projet
    projet.archive = False
    await db.commit()
    await db.refresh(projet)
    
    return ProjetResponse.model_validate(projet)