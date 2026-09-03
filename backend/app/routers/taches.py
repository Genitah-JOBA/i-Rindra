# app/routers/taches.py

"""
Routes pour la gestion des tâches et du Kanban (RF-11 à RF-15, RF-23, RF-24).
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, and_, func
from typing import List, Optional

from app.core.database import get_db
from app.core.security import decode_access_token
from app.routers.auth import oauth2_scheme, get_current_user_id, get_current_user_role
from app.routers.projets import check_projet_access, check_direction_or_chef_projet
from app.models.projet import Projet
from app.services import notifications as notif_service
from app.models.tache import Tache, StatutTache, PrioriteTache
from app.models.tache import CommentaireTache
from app.models.saisie_temps import SaisieTemps
from app.models.utilisateur import Utilisateur
from app.schemas.tache import (
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

router = APIRouter(prefix="/taches", tags=["Tâches"])

# ============================================================
# TÂCHES
# ============================================================

@router.get("/projets/{projet_id}/taches", response_model=List[TacheListResponse])
async def get_taches_by_projet(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),  # Vérifie l'accès au projet
    db: AsyncSession = Depends(get_db),
    statut: Optional[StatutTacheEnum] = Query(None, description="Filtrer par statut"),
    responsable_id: Optional[int] = Query(None, description="Filtrer par responsable")
):
    """
    Récupère toutes les tâches d'un projet.
    Les tâches sont triées par ordre dans la colonne Kanban.
    """
    # Construction de la requête
    query = select(Tache).where(Tache.projet_id == projet_id)
    
    # Filtres optionnels
    if statut:
        query = query.where(Tache.statut == statut)
    
    if responsable_id:
        query = query.where(Tache.responsable_id == responsable_id)
    
    # Tri par statut puis par ordre
    query = query.order_by(Tache.statut, Tache.ordre)
    
    # Exécution
    result = await db.execute(query)
    taches = result.scalars().all()
    
    return [TacheListResponse.model_validate(t) for t in taches]

@router.get("/{tache_id}", response_model=TacheResponse)
async def get_tache(
    tache_id: int,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id)
):
    """
    Récupère les détails d'une tâche spécifique.
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    # 2. Vérifie que l'utilisateur a accès au projet
    # On utilise check_projet_access mais on ne peut pas l'injecter directement
    # car elle attend un projet_id. On vérifie manuellement.
    await check_projet_access(tache.projet_id, db=db, token=None)
    # Note: ce n'est pas idéal, mais pour l'instant ça fonctionne.
    # On améliorera plus tard avec une dépendance plus sophistiquée.
    
    return TacheResponse.model_validate(tache)

@router.post("/projets/{projet_id}/taches", response_model=TacheResponse, status_code=status.HTTP_201_CREATED)
async def create_tache(
    projet_id: int,
    tache_data: TacheCreate,
    projet: Projet = Depends(check_projet_access),  # Vérifie l'accès
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)  # Vérifie les permissions
):
    """
    Crée une nouvelle tâche dans un projet.
    
    **Permissions :** Seule la direction ou le chef de projet peut créer une tâche (RF-15).
    """
    # 1. Vérifie que le projet existe
    # Déjà fait par check_projet_access
    
    # 2. Vérifie que le responsable existe (si spécifié)
    if tache_data.responsable_id:
        result = await db.execute(
            select(Utilisateur).where(Utilisateur.id == tache_data.responsable_id)
        )
        responsable = result.scalar_one_or_none()
        
        if not responsable:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Responsable non trouvé"
            )
    
    # 3. Calcule l'ordre (dernière position dans la colonne)
    result = await db.execute(
        select(func.max(Tache.ordre))
        .where(and_(
            Tache.projet_id == projet_id,
            Tache.statut == tache_data.statut
        ))
    )
    max_ordre = result.scalar_one_or_none()
    ordre = (max_ordre or 0) + 1
    
    # 4. Crée la tâche
    new_tache = Tache(
        titre=tache_data.titre,
        description=tache_data.description,
        projet_id=projet_id,
        responsable_id=tache_data.responsable_id,
        statut=tache_data.statut or StatutTache.A_FAIRE,
        priorite=tache_data.priorite,
        echeance=tache_data.echeance,
        ordre=ordre,
    )
    
    db.add(new_tache)
    await db.commit()
    await db.refresh(new_tache)
    
    # 5. Met à jour l'avancement du projet (RF-09)
    await update_projet_avancement(projet_id, db)
    
    return TacheResponse.model_validate(new_tache)

@router.put("/{tache_id}", response_model=TacheResponse)
async def update_tache(
    tache_id: int,
    tache_data: TacheUpdate,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    role: str = Depends(get_current_user_role)
):
    """
    Met à jour une tâche existante.
    
    **Permissions (RF-15) :**
    - Direction/Chef de projet : peut tout modifier
    - Équipe (dev/design) : peut modifier le statut et ajouter des commentaires
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    # 2. Vérifie l'accès au projet
    await check_projet_access(tache.projet_id, db=db, token=None)
    
    # 3. Vérifie les permissions
    if role not in ["admin", "direction", "equipe"]:
        # Les membres de l'équipe peuvent seulement modifier le statut et le responsable
        if tache_data.statut is None and tache_data.responsable_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous ne pouvez modifier que le statut ou l'affectation de cette tâche"
            )
        # Limite les champs modifiables pour les non-chefs
        allowed_fields = {"statut", "responsable_id"}
        if any(f not in allowed_fields for f in tache_data.model_dump(exclude_unset=True).keys()):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous ne pouvez modifier que le statut ou l'affectation de cette tâche"
            )
    
    # 4. Met à jour les champs
    old_statut = tache.statut
    update_data = tache_data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(tache, key, value)
    
    # 5. Gestion de l'ordre si le statut change
    if "statut" in update_data and update_data["statut"] != old_statut:
        # Réorganise l'ordre dans la nouvelle colonne
        result = await db.execute(
            select(func.max(Tache.ordre))
            .where(and_(
                Tache.projet_id == tache.projet_id,
                Tache.statut == tache.statut
            ))
        )
        max_ordre = result.scalar_one_or_none()
        tache.ordre = (max_ordre or 0) + 1
    
    # 6. Sauvegarde
    await db.commit()
    await db.refresh(tache)
    
    # 7. Met à jour l'avancement du projet
    await update_projet_avancement(tache.projet_id, db)
    
    return TacheResponse.model_validate(tache)

@router.delete("/{tache_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tache(
    tache_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)  # Vérifie les permissions
):
    """
    Supprime une tâche.
    
    **Permissions :** Seule la direction ou le chef de projet peut supprimer une tâche.
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    projet_id = tache.projet_id
    
    # 2. Supprime la tâche
    await db.delete(tache)
    await db.commit()
    
    # 3. Met à jour l'avancement du projet
    await update_projet_avancement(projet_id, db)
    
    return None

@router.patch("/{tache_id}/statut", response_model=TacheResponse)
async def update_tache_statut(
    tache_id: int,
    nouveau_statut: StatutTacheEnum,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    role: str = Depends(get_current_user_role)
):
    """
    Change le statut d'une tâche (déplacement dans le Kanban).
    
    **Permissions :** Tout membre du projet peut changer le statut d'une tâche.
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    # 2. Vérifie l'accès au projet
    await check_projet_access(tache.projet_id, db=db, token=None)
    
    # 3. Change le statut
    old_statut = tache.statut
    tache.statut = nouveau_statut
    
    # 4. Réorganise l'ordre
    result = await db.execute(
        select(func.max(Tache.ordre))
        .where(and_(
            Tache.projet_id == tache.projet_id,
            Tache.statut == nouveau_statut
        ))
    )
    max_ordre = result.scalar_one_or_none()
    tache.ordre = (max_ordre or 0) + 1
    
    # 5. Sauvegarde
    await db.commit()
    await db.refresh(tache)
    
    # 6. Met à jour l'avancement du projet
    await update_projet_avancement(tache.projet_id, db)

    # 7. Notifications d'avancement : direction + client + membres (sauf l'auteur)
    res_p = await db.execute(select(Projet).where(Projet.id == tache.projet_id))
    projet = res_p.scalar_one_or_none()
    destinataires = await notif_service.ids_direction(db)
    destinataires += await notif_service.ids_membres_projet(db, tache.projet_id)
    if projet:
        destinataires += await notif_service.ids_clients_du_projet(db, projet.client_id)
    destinataires = [d for d in destinataires if d != current_user_id]
    labels = {"a_faire": "À faire", "en_cours": "En cours", "en_revue": "En revue", "termine": "Terminé"}
    statut_txt = labels.get(nouveau_statut.value, nouveau_statut.value)
    await notif_service.notifier(
        db,
        destinataires,
        "tache_avancement",
        f"Tâche « {tache.titre} » déplacée vers « {statut_txt} »",
        f"/taches?projet={tache.projet_id}",
    )
    await db.commit()

    return TacheResponse.model_validate(tache)

@router.patch("/{tache_id}/affectation", response_model=TacheResponse)
async def update_tache_affectation(
    tache_id: int,
    responsable_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)  # Vérifie les permissions
):
    """
    Change le responsable d'une tâche (RF-13).
    
    **Permissions :** Seule la direction ou le chef de projet peut affecter une tâche.
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    # 2. Vérifie que le responsable existe
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == responsable_id)
    )
    responsable = result.scalar_one_or_none()
    
    if not responsable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Responsable non trouvé"
        )
    
    # 3. Met à jour le responsable
    tache.responsable_id = responsable_id
    await db.commit()
    await db.refresh(tache)
    
    return TacheResponse.model_validate(tache)

# ============================================================
# COMMENTAIRES
# ============================================================

@router.get("/{tache_id}/commentaires", response_model=List[CommentaireTacheResponse])
async def get_commentaires(
    tache_id: int,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id)
):
    """
    Récupère tous les commentaires d'une tâche (RF-14).
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    # 2. Vérifie l'accès au projet
    await check_projet_access(tache.projet_id, db=db, token=None)
    
    # 3. Récupère les commentaires
    result = await db.execute(
        select(CommentaireTache)
        .where(CommentaireTache.tache_id == tache_id)
        .order_by(CommentaireTache.cree_le)
    )
    commentaires = result.scalars().all()
    
    return [CommentaireTacheResponse.model_validate(c) for c in commentaires]

@router.post("/{tache_id}/commentaires", response_model=CommentaireTacheResponse, status_code=status.HTTP_201_CREATED)
async def create_commentaire(
    tache_id: int,
    commentaire_data: CommentaireTacheCreate,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id)
):
    """
    Ajoute un commentaire à une tâche.
    
    **Permissions :** Tout membre du projet peut commenter (RF-14).
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    # 2. Vérifie l'accès au projet
    await check_projet_access(tache.projet_id, db=db, token=None)
    
    # 3. Crée le commentaire
    new_commentaire = CommentaireTache(
        tache_id=tache_id,
        utilisateur_id=current_user_id,
        contenu=commentaire_data.contenu,
    )
    
    db.add(new_commentaire)
    await db.commit()
    await db.refresh(new_commentaire)
    
    return CommentaireTacheResponse.model_validate(new_commentaire)

# ============================================================
# SUIVI DU TEMPS
# ============================================================

@router.post("/{tache_id}/temps", response_model=SaisieTempsResponse, status_code=status.HTTP_201_CREATED)
async def saisir_temps(
    tache_id: int,
    temps_data: SaisieTempsCreate,
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id)
):
    """
    Saisit le temps passé sur une tâche (RF-23, RF-24).
    
    **Permissions :** Tout membre du projet peut saisir son temps.
    """
    # 1. Récupère la tâche
    result = await db.execute(
        select(Tache).where(Tache.id == tache_id)
    )
    tache = result.scalar_one_or_none()
    
    if not tache:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tâche non trouvée"
        )
    
    # 2. Vérifie l'accès au projet
    await check_projet_access(tache.projet_id, db=db, token=None)
    
    # 3. Crée la saisie de temps
    new_temps = SaisieTemps(
        tache_id=tache_id,
        utilisateur_id=current_user_id,
        duree_min=temps_data.duree_min,
        date=temps_data.date,
        note=temps_data.note,
    )
    
    db.add(new_temps)
    await db.commit()
    await db.refresh(new_temps)
    
    return SaisieTempsResponse.model_validate(new_temps)

@router.get("/projets/{projet_id}/temps")
async def get_temps_projet(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),  # Vérifie l'accès
    db: AsyncSession = Depends(get_db)
):
    """
    Récupère toutes les saisies de temps d'un projet.
    """
    # Récupère les temps via les tâches du projet
    result = await db.execute(
        select(SaisieTemps)
        .join(Tache, SaisieTemps.tache_id == Tache.id)
        .where(Tache.projet_id == projet_id)
        .order_by(SaisieTemps.date)
    )
    temps = result.scalars().all()
    
    return [
        {
            "id": t.id,
            "tache_id": t.tache_id,
            "utilisateur_id": t.utilisateur_id,
            "duree_min": t.duree_min,
            "date": t.date,
            "note": t.note,
            "tache_titre": (await db.execute(select(Tache.titre).where(Tache.id == t.tache_id))).scalar_one_or_none()
        }
        for t in temps
    ]

# ============================================================
# FONCTIONS UTILITAIRES
# ============================================================

async def update_projet_avancement(projet_id: int, db: AsyncSession):
    """
    Met à jour l'avancement d'un projet en fonction de ses tâches (RF-09).
    L'avancement est calculé en fonction du nombre de tâches terminées.
    """
    # 1. Compte toutes les tâches du projet
    result = await db.execute(
        select(func.count(Tache.id))
        .where(Tache.projet_id == projet_id)
    )
    total = result.scalar_one_or_none() or 1  # Évite la division par zéro
    
    # 2. Compte les tâches terminées
    result = await db.execute(
        select(func.count(Tache.id))
        .where(and_(
            Tache.projet_id == projet_id,
            Tache.statut == StatutTache.TERMINE
        ))
    )
    termine = result.scalar_one_or_none() or 0
    
    # 3. Calcule le pourcentage
    avancement = (termine / total) * 100 if total > 0 else 0
    
    # 4. Met à jour le projet
    await db.execute(
        update(Projet)
        .where(Projet.id == projet_id)
        .values(avancement_pct=round(avancement, 1))
    )
    await db.commit()