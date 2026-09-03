# app/routers/projets.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, or_, and_, func
from typing import List, Optional
from datetime import date, datetime
from app.models.jalon import Jalon

from app.core.database import get_db
from app.core.security import decode_access_token
from app.routers.auth import oauth2_scheme, get_current_user_id, get_current_user_role
from app.models.projet import Projet, StatutSante
from app.models.client import Client
from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.projet import ProjetMembre
from app.services import notifications as notif_service
from app.schemas.projet import ProjetCreate, ProjetUpdate, ProjetResponse, ProjetListResponse
from app.schemas.membre import (
    MembreCreate,
    MembreResponse,
    MembreListResponse,
    MembreUpdate,
)

from app.schemas.jalon import (
    JalonCreate,
    JalonUpdate,
    JalonResponse,
    JalonListResponse,
)
router = APIRouter(prefix="/projets", tags=["Projets"])

# ============================================================
# DÉPENDANCES DE PERMISSIONS
# ============================================================

async def check_direction_or_chef_projet(role: str = Depends(get_current_user_role)):
    """
    Vérifie que l'utilisateur est direction ou chef de projet.
    """
    if role not in ["direction", "equipe"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul la direction ou le chef de projet peut effectuer cette action"
        )
    return role

async def check_projet_access(
    projet_id: int,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    """
    Vérifie que l'utilisateur a accès au projet.

    Utilisable de deux façons :
      - en dépendance FastAPI (token fourni par oauth2_scheme) -> contrôle complet du rôle ;
      - en appel interne avec token=None -> vérifie seulement que le projet existe
        (l'endpoint appelant a déjà authentifié l'utilisateur).
    """
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

    # Appel interne sans token : on s'arrête à la vérification d'existence
    if token is None:
        return projet

    # 1. Récupère l'utilisateur
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")

    # 3. Vérifie les permissions selon le rôle
    if role == "direction":
        return projet
    
    elif role == "equipe":
        # Vérifie s'il est responsable du projet
        if projet.responsable_id == user_id:
            return projet
        
        # Vérifie s'il est membre du projet
        result_membre = await db.execute(
            select(ProjetMembre).where(
                and_(
                    ProjetMembre.projet_id == projet_id,
                    ProjetMembre.utilisateur_id == user_id
                )
            )
        )
        membre = result_membre.scalar_one_or_none()
        
        if membre:
            return projet
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas accès à ce projet"
        )
    
    elif role == "client":
        if projet.client_id == client_id:
            return projet
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas accès à ce projet"
        )
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Accès non autorisé"
    )

# ============================================================
# ENDPOINTS PROJETS (CRUD)
# ============================================================

@router.get("/", response_model=List[ProjetListResponse])
async def get_projets(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    archive: Optional[bool] = Query(None, description="Filtrer par archive"),
    statut: Optional[StatutSante] = Query(None, description="Filtrer par statut de santé"),
    search: Optional[str] = Query(None, description="Rechercher dans le nom ou la description")
):
    """Liste des projets accessibles à l'utilisateur"""
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")
    
    query = select(Projet)
    
    if role == "direction":
        pass
    elif role == "equipe":
        subquery_membre = select(ProjetMembre.projet_id).where(
            ProjetMembre.utilisateur_id == user_id
        )
        query = query.where(
            or_(
                Projet.responsable_id == user_id,
                Projet.id.in_(subquery_membre)
            )
        )
    elif role == "client":
        if client_id:
            query = query.where(Projet.client_id == client_id)
        else:
            return []
    
    if archive is not None:
        query = query.where(Projet.archive == archive)
    
    if statut:
        query = query.where(Projet.statut_sante == statut)
    
    if search:
        query = query.where(
            or_(
                Projet.nom.ilike(f"%{search}%"),
                Projet.description.ilike(f"%{search}%")
            )
        )
    
    result = await db.execute(query)
    projets = result.scalars().all()
    
    return [ProjetListResponse.model_validate(p) for p in projets]

@router.get("/{projet_id}", response_model=ProjetResponse)
async def get_projet(
    projet_id: int,
    projet: Projet = Depends(check_projet_access)
):
    """Détails d'un projet"""
    return ProjetResponse.model_validate(projet)

@router.post("/", response_model=ProjetResponse, status_code=status.HTTP_201_CREATED)
async def create_projet(
    projet_data: ProjetCreate,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """Crée un nouveau projet"""
    # Vérifie que le client existe
    result = await db.execute(
        select(Client).where(Client.id == projet_data.client_id)
    )
    client = result.scalar_one_or_none()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client non trouvé"
        )
    
    # Vérifie que le responsable existe
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == projet_data.responsable_id)
    )
    responsable = result.scalar_one_or_none()
    
    if not responsable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Responsable non trouvé"
        )
    
    if responsable.role != RoleUtilisateur.DIRECTION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le responsable d'un projet doit être un membre de la direction."
        )
    
    # Crée le projet
    new_projet = Projet(
        nom=projet_data.nom,
        description=projet_data.description,
        client_id=projet_data.client_id,
        responsable_id=projet_data.responsable_id,
        date_debut=projet_data.date_debut,
        date_fin_prevue=projet_data.date_fin_prevue,
        statut_sante=StatutSante.VERT,
        avancement_pct=0,
        archive=False,
    )
    
    db.add(new_projet)
    await db.commit()
    await db.refresh(new_projet)
    
    # Ajoute automatiquement le responsable comme membre du projet
    membre = ProjetMembre(
        projet_id=new_projet.id,
        utilisateur_id=projet_data.responsable_id,
        role_dans_projet="responsable"
    )
    db.add(membre)
    await db.commit()

    # Notifications : direction (admin) + client du projet
    destinataires = await notif_service.ids_direction(db)
    destinataires += await notif_service.ids_clients_du_projet(db, new_projet.client_id)
    await notif_service.notifier(
        db,
        destinataires,
        "projet_cree",
        f"Nouveau projet : « {new_projet.nom} »",
        f"/projets/{new_projet.id}",
    )
    await db.commit()

    return ProjetResponse.model_validate(new_projet)

@router.put("/{projet_id}", response_model=ProjetResponse)
async def update_projet(
    projet_id: int,
    projet_data: ProjetUpdate,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """Met à jour un projet"""
    update_data = projet_data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(projet, key, value)
    
    await db.commit()
    await db.refresh(projet)
    
    return ProjetResponse.model_validate(projet)

@router.delete("/{projet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_projet(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """Supprime un projet (suppression définitive)"""
    await db.delete(projet)
    await db.commit()
    
    return None

@router.post("/{projet_id}/archiver", response_model=ProjetResponse)
async def archiver_projet(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """Archive un projet (soft delete)"""
    projet.archive = True
    await db.commit()
    await db.refresh(projet)
    
    return ProjetResponse.model_validate(projet)

@router.post("/{projet_id}/desarchiver", response_model=ProjetResponse)
async def desarchiver_projet(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """Désarchive un projet"""
    projet.archive = False
    await db.commit()
    await db.refresh(projet)
    
    return ProjetResponse.model_validate(projet)

# ============================================================
# ⭐ GESTION DES MEMBRES D'ÉQUIPE (RF-06, RF-13)
# ============================================================

@router.get("/{projet_id}/membres", response_model=List[MembreListResponse])
async def get_projet_membres(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db)
):
    """
    Récupère la liste des membres d'un projet (RF-06).
    
    Retourne tous les utilisateurs affectés au projet avec leur rôle.
    """
    # Récupère les membres avec leurs informations
    result = await db.execute(
        select(ProjetMembre, Utilisateur)
        .join(Utilisateur, ProjetMembre.utilisateur_id == Utilisateur.id)
        .where(ProjetMembre.projet_id == projet_id)
        .order_by(Utilisateur.nom, Utilisateur.prenom)
    )
    membres = result.all()
    
    # Formatage de la réponse
    return [
        MembreListResponse(
            id=membre.ProjetMembre.id,
            projet_id=membre.ProjetMembre.projet_id,
            utilisateur_id=membre.Utilisateur.id,
            nom=membre.Utilisateur.nom,
            prenom=membre.Utilisateur.prenom,
            email=membre.Utilisateur.email,
            role_global=membre.Utilisateur.role.value,
            metier=membre.Utilisateur.metier,
            role_dans_projet=membre.ProjetMembre.role_dans_projet,
            est_responsable=(membre.ProjetMembre.utilisateur_id == projet.responsable_id),
            cree_le=membre.ProjetMembre.cree_le if hasattr(membre.ProjetMembre, 'cree_le') else None,
        )
        for membre in membres
    ]

@router.post("/{projet_id}/membres", response_model=MembreResponse, status_code=status.HTTP_201_CREATED)
async def ajouter_membre(
    projet_id: int,
    membre_data: MembreCreate,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Ajoute un membre à un projet (RF-06, RF-13).
    
    **Permissions :** Seule la direction ou le chef de projet peut ajouter des membres.
    
    **Corps de la requête :**
    - utilisateur_id: ID de l'utilisateur à ajouter
    - role_dans_projet: (optionnel) rôle dans le projet (ex: "développeur", "designer")
    """
    # 1. Vérifie que l'utilisateur existe
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == membre_data.utilisateur_id)
    )
    utilisateur = result.scalar_one_or_none()
    
    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    # 2. Vérifie que l'utilisateur n'est pas déjà membre
    result = await db.execute(
        select(ProjetMembre).where(
            and_(
                ProjetMembre.projet_id == projet_id,
                ProjetMembre.utilisateur_id == membre_data.utilisateur_id
            )
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet utilisateur est déjà membre de ce projet"
        )
    
    # 3. Vérifie que l'utilisateur n'est pas un client (un client ne peut pas être membre d'une équipe)
    if utilisateur.role == RoleUtilisateur.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un client ne peut pas être ajouté comme membre d'équipe"
        )
    
    # 4. Si le rôle n'est pas spécifié, on met "membre" par défaut
    role_dans_projet = membre_data.role_dans_projet or "membre"
    
    # 5. Crée la relation membre
    nouveau_membre = ProjetMembre(
        projet_id=projet_id,
        utilisateur_id=membre_data.utilisateur_id,
        role_dans_projet=role_dans_projet,
    )
    
    db.add(nouveau_membre)
    await db.commit()
    await db.refresh(nouveau_membre)

    # Notifie le membre qu'il a été affecté au projet
    await notif_service.notifier(
        db,
        [nouveau_membre.utilisateur_id],
        "membre_ajoute",
        f"Vous avez été affecté au projet « {projet.nom} »",
        f"/projets/{projet.id}",
    )
    await db.commit()

    # 6. Retourne la réponse
    return MembreResponse(
        id=nouveau_membre.id,
        projet_id=nouveau_membre.projet_id,
        utilisateur_id=nouveau_membre.utilisateur_id,
        nom=utilisateur.nom,
        prenom=utilisateur.prenom,
        email=utilisateur.email,
        role_global=utilisateur.role.value,
        metier=utilisateur.metier,
        role_dans_projet=nouveau_membre.role_dans_projet,
        est_responsable=(utilisateur.id == projet.responsable_id),
        message=f"{utilisateur.prenom} {utilisateur.nom} a été ajouté au projet avec succès"
    )

@router.put("/{projet_id}/membres/{utilisateur_id}", response_model=MembreResponse)
async def modifier_membre(
    projet_id: int,
    utilisateur_id: int,
    membre_data: MembreUpdate,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Modifie le rôle d'un membre dans un projet.
    
    **Permissions :** Seule la direction ou le chef de projet peut modifier les rôles.
    """
    # 1. Vérifie que le membre existe
    result = await db.execute(
        select(ProjetMembre).where(
            and_(
                ProjetMembre.projet_id == projet_id,
                ProjetMembre.utilisateur_id == utilisateur_id
            )
        )
    )
    membre = result.scalar_one_or_none()
    
    if not membre:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ce membre n'est pas dans le projet"
        )
    
    # 2. Empêche de modifier le responsable si c'est le seul responsable
    if projet.responsable_id == utilisateur_id:
        # On peut modifier son rôle mais on ne peut pas le retirer
        if membre_data.role_dans_projet is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le responsable doit avoir un rôle dans le projet"
            )
    
    # 3. Met à jour le rôle
    if membre_data.role_dans_projet is not None:
        membre.role_dans_projet = membre_data.role_dans_projet
    
    await db.commit()
    await db.refresh(membre)
    
    # 4. Récupère les infos de l'utilisateur
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == utilisateur_id)
    )
    utilisateur = result.scalar_one_or_none()
    
    return MembreResponse(
        id=membre.id,
        projet_id=membre.projet_id,
        utilisateur_id=membre.utilisateur_id,
        nom=utilisateur.nom,
        prenom=utilisateur.prenom,
        email=utilisateur.email,
        role_global=utilisateur.role.value,
        role_dans_projet=membre.role_dans_projet,
        est_responsable=(utilisateur.id == projet.responsable_id),
        message="Rôle modifié avec succès"
    )

@router.delete("/{projet_id}/membres/{utilisateur_id}", status_code=status.HTTP_204_NO_CONTENT)
async def retirer_membre(
    projet_id: int,
    utilisateur_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    role: str = Depends(check_direction_or_chef_projet)
):
    """
    Retire un membre d'un projet (RF-06).

    **Permissions :** Seule la direction ou le chef de projet peut retirer des membres.
    """
    # 1. Vérifie que le membre existe
    result = await db.execute(
        select(ProjetMembre).where(
            and_(
                ProjetMembre.projet_id == projet_id,
                ProjetMembre.utilisateur_id == utilisateur_id
            )
        )
    )
    membre = result.scalar_one_or_none()
    
    if not membre:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ce membre n'est pas dans le projet"
        )
    
    # 2. Empêche de retirer le responsable du projet
    if projet.responsable_id == utilisateur_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de retirer le responsable du projet. Transférez d'abord la responsabilité à un autre membre."
        )
    
    # 3. Empêche de se retirer soi-même (sauf si direction)
    if utilisateur_id == current_user_id and role != "direction":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas vous retirer vous-même du projet. Contactez un chef de projet."
        )
    
    # 4. Supprime le membre
    await db.delete(membre)
    await db.commit()
    
    return None

@router.post("/{projet_id}/transferer-responsabilite", response_model=ProjetResponse)
async def transferer_responsabilite(
    projet_id: int,
    nouveau_responsable_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Transfère la responsabilité du projet à un autre membre.
    
    **Permissions :** Seule la direction ou le chef de projet peut transférer la responsabilité.
    """
    # 1. Vérifie que le nouveau responsable existe
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == nouveau_responsable_id)
    )
    nouveau_responsable = result.scalar_one_or_none()
    
    if not nouveau_responsable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    # 2. Vérifie que le nouveau responsable est membre du projet
    result = await db.execute(
        select(ProjetMembre).where(
            and_(
                ProjetMembre.projet_id == projet_id,
                ProjetMembre.utilisateur_id == nouveau_responsable_id
            )
        )
    )
    membre = result.scalar_one_or_none()
    
    if not membre:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le nouveau responsable doit être membre du projet"
        )
    
    # 3. Vérifie que le nouveau responsable n'est pas un client
    if nouveau_responsable.role == RoleUtilisateur.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un client ne peut pas être responsable d'un projet"
        )
    
    # 4. Met à jour le responsable
    ancien_responsable_id = projet.responsable_id
    projet.responsable_id = nouveau_responsable_id
    
    # 5. Met à jour les rôles dans projet_membre
    # L'ancien responsable devient "membre" (sauf s'il a un autre rôle)
    if ancien_responsable_id != nouveau_responsable_id:
        # Mise à jour de l'ancien responsable
        await db.execute(
            update(ProjetMembre)
            .where(
                and_(
                    ProjetMembre.projet_id == projet_id,
                    ProjetMembre.utilisateur_id == ancien_responsable_id
                )
            )
            .values(role_dans_projet="membre")
        )
        
        # Mise à jour du nouveau responsable
        await db.execute(
            update(ProjetMembre)
            .where(
                and_(
                    ProjetMembre.projet_id == projet_id,
                    ProjetMembre.utilisateur_id == nouveau_responsable_id
                )
            )
            .values(role_dans_projet="responsable")
        )
    
    await db.commit()
    await db.refresh(projet)
    
    return ProjetResponse.model_validate(projet)

@router.get("/{projet_id}/membres/disponibles")
async def get_membres_disponibles(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Rechercher un membre par nom ou email"),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Récupère la liste des utilisateurs disponibles pour être ajoutés au projet.
    (Utilisateurs qui ne sont pas déjà membres du projet)
    """
    # 1. Récupère les IDs des membres actuels
    result = await db.execute(
        select(ProjetMembre.utilisateur_id)
        .where(ProjetMembre.projet_id == projet_id)
    )
    membres_ids = [row[0] for row in result.all()]
    
    # 2. Récupère les utilisateurs disponibles
    query = select(Utilisateur).where(
        and_(
            Utilisateur.id.not_in(membres_ids) if membres_ids else True,
            Utilisateur.actif == True,
            Utilisateur.role != RoleUtilisateur.CLIENT  # Exclut les clients
        )
    )
    
    if search:
        query = query.where(
            or_(
                Utilisateur.nom.ilike(f"%{search}%"),
                Utilisateur.prenom.ilike(f"%{search}%"),
                Utilisateur.email.ilike(f"%{search}%")
            )
        )
    
    query = query.order_by(Utilisateur.nom, Utilisateur.prenom)
    
    result = await db.execute(query)
    utilisateurs = result.scalars().all()
    
    return [
        {
            "id": u.id,
            "nom": u.nom,
            "prenom": u.prenom,
            "email": u.email,
            "role": u.role.value,
            "metier": u.metier,
            "actif": u.actif,
        }
        for u in utilisateurs
    ]

@router.get("/{projet_id}/jalons", response_model=List[JalonListResponse])
async def get_projet_jalons(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    atteint: Optional[bool] = Query(None, description="Filtrer par statut (atteint/non atteint)")
):
    """
    Récupère la liste des jalons d'un projet (RF-07).
    
    **Filtres :**
    - atteint: true/false pour filtrer les jalons atteints ou non
    """
    # Construction de la requête
    query = select(Jalon).where(Jalon.projet_id == projet_id)
    
    if atteint is not None:
        query = query.where(Jalon.atteint == atteint)
    
    # Tri par date d'échéance (les plus proches d'abord)
    query = query.order_by(Jalon.echeance)
    
    result = await db.execute(query)
    jalons = result.scalars().all()
    
    return [JalonListResponse.model_validate(j) for j in jalons]

@router.get("/{projet_id}/jalons/{jalon_id:int}", response_model=JalonResponse)
async def get_jalon(
    projet_id: int,
    jalon_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db)
):
    """
    Récupère les détails d'un jalon spécifique.
    """
    # Récupère le jalon
    result = await db.execute(
        select(Jalon).where(
            and_(
                Jalon.id == jalon_id,
                Jalon.projet_id == projet_id
            )
        )
    )
    jalon = result.scalar_one_or_none()
    
    if not jalon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jalon non trouvé"
        )
    
    return JalonResponse.model_validate(jalon)

@router.post("/{projet_id}/jalons", response_model=JalonResponse, status_code=status.HTTP_201_CREATED)
async def create_jalon(
    projet_id: int,
    jalon_data: JalonCreate,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Crée un nouveau jalon dans un projet (RF-07).
    
    **Permissions :** Seule la direction ou le chef de projet peut créer un jalon.
    """
    # 1. Vérifie que le projet existe (déjà fait par check_projet_access)
    
    # 2. Vérifie que la date d'échéance n'est pas dans le passé
    if jalon_data.echeance < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date d'échéance ne peut pas être dans le passé"
        )
    
    # 3. Crée le jalon
    new_jalon = Jalon(
        titre=jalon_data.titre,
        description=jalon_data.description,
        projet_id=projet_id,
        echeance=jalon_data.echeance,
        atteint=False,
    )
    
    db.add(new_jalon)
    await db.commit()
    await db.refresh(new_jalon)
    
    return JalonResponse.model_validate(new_jalon)

@router.put("/{projet_id}/jalons/{jalon_id}", response_model=JalonResponse)
async def update_jalon(
    projet_id: int,
    jalon_id: int,
    jalon_data: JalonUpdate,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Met à jour un jalon existant.
    
    **Permissions :** Seule la direction ou le chef de projet peut modifier un jalon.
    """
    # 1. Récupère le jalon
    result = await db.execute(
        select(Jalon).where(
            and_(
                Jalon.id == jalon_id,
                Jalon.projet_id == projet_id
            )
        )
    )
    jalon = result.scalar_one_or_none()
    
    if not jalon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jalon non trouvé"
        )
    
    # 2. Met à jour les champs
    update_data = jalon_data.model_dump(exclude_unset=True)
    
    # Vérifie si le statut "atteint" change
    if "atteint" in update_data and update_data["atteint"] is True and not jalon.atteint:
        # Marquer comme atteint avec la date actuelle
        jalon.date_atteint = datetime.now()
    elif "atteint" in update_data and update_data["atteint"] is False:
        # Réinitialiser la date d'atteint
        jalon.date_atteint = None
    
    for key, value in update_data.items():
        setattr(jalon, key, value)
    
    # 3. Sauvegarde
    await db.commit()
    await db.refresh(jalon)
    
    return JalonResponse.model_validate(jalon)

@router.delete("/{projet_id}/jalons/{jalon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_jalon(
    projet_id: int,
    jalon_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Supprime un jalon.
    
    **Permissions :** Seule la direction ou le chef de projet peut supprimer un jalon.
    """
    # Récupère le jalon
    result = await db.execute(
        select(Jalon).where(
            and_(
                Jalon.id == jalon_id,
                Jalon.projet_id == projet_id
            )
        )
    )
    jalon = result.scalar_one_or_none()
    
    if not jalon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jalon non trouvé"
        )
    
    # Supprime le jalon
    await db.delete(jalon)
    await db.commit()
    
    return None

@router.post("/{projet_id}/jalons/{jalon_id}/atteindre", response_model=JalonResponse)
async def atteindre_jalon(
    projet_id: int,
    jalon_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db)
):
    """
    Marque un jalon comme atteint (RF-07).
    
    **Permissions :** Tout membre du projet peut marquer un jalon comme atteint.
    """
    # Récupère le jalon
    result = await db.execute(
        select(Jalon).where(
            and_(
                Jalon.id == jalon_id,
                Jalon.projet_id == projet_id
            )
        )
    )
    jalon = result.scalar_one_or_none()
    
    if not jalon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jalon non trouvé"
        )
    
    # Marque comme atteint
    if not jalon.atteint:
        jalon.atteint = True
        jalon.date_atteint = datetime.now()
        await db.commit()
        await db.refresh(jalon)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce jalon est déjà marqué comme atteint"
        )
    
    return JalonResponse.model_validate(jalon)

@router.post("/{projet_id}/jalons/{jalon_id}/reinitialiser", response_model=JalonResponse)
async def reinitialiser_jalon(
    projet_id: int,
    jalon_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Réinitialise un jalon (le marque comme non atteint).
    
    **Permissions :** Seule la direction ou le chef de projet peut réinitialiser un jalon.
    """
    # Récupère le jalon
    result = await db.execute(
        select(Jalon).where(
            and_(
                Jalon.id == jalon_id,
                Jalon.projet_id == projet_id
            )
        )
    )
    jalon = result.scalar_one_or_none()
    
    if not jalon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Jalon non trouvé"
        )
    
    # Réinitialise
    if jalon.atteint:
        jalon.atteint = False
        jalon.date_atteint = None
        await db.commit()
        await db.refresh(jalon)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce jalon n'est pas encore atteint"
        )
    
    return JalonResponse.model_validate(jalon)

@router.get("/{projet_id}/jalons/statistiques")
async def get_jalon_statistiques(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db)
):
    """
    Récupère les statistiques des jalons d'un projet.
    """
    # 1. Total des jalons
    result = await db.execute(
        select(func.count(Jalon.id))
        .where(Jalon.projet_id == projet_id)
    )
    total = result.scalar_one_or_none() or 0
    
    # 2. Jalons atteints
    result = await db.execute(
        select(func.count(Jalon.id))
        .where(
            and_(
                Jalon.projet_id == projet_id,
                Jalon.atteint == True
            )
        )
    )
    atteints = result.scalar_one_or_none() or 0
    
    # 3. Jalons en retard (échéance dépassée et non atteints)
    result = await db.execute(
        select(func.count(Jalon.id))
        .where(
            and_(
                Jalon.projet_id == projet_id,
                Jalon.atteint == False,
                Jalon.echeance < date.today()
            )
        )
    )
    en_retard = result.scalar_one_or_none() or 0
    
    # 4. Prochains jalons (échéance à venir, triés par date)
    result = await db.execute(
        select(Jalon)
        .where(
            and_(
                Jalon.projet_id == projet_id,
                Jalon.atteint == False,
                Jalon.echeance >= date.today()
            )
        )
        .order_by(Jalon.echeance)
        .limit(5)
    )
    prochains = result.scalars().all()
    
    return {
        "total": total,
        "atteints": atteints,
        "en_retard": en_retard,
        "a_venir": total - atteints - en_retard,
        "taux_avancement": round((atteints / total * 100) if total > 0 else 0, 1),
        "prochains_jalons": [
            {
                "id": j.id,
                "titre": j.titre,
                "echeance": j.echeance,
                "jours_restants": (j.echeance - date.today()).days if j.echeance >= date.today() else 0,
            }
            for j in prochains
        ]
    }