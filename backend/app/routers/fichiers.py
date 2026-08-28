# app/routers/fichiers.py

"""
Routes pour la gestion des fichiers (RF-08).
Upload, téléchargement, liste, suppression.
"""

import os
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_

from app.core.database import get_db
from app.core.security import decode_access_token
from app.routers.auth import oauth2_scheme, get_current_user_id
from app.routers.projets import check_projet_access, check_direction_or_chef_projet
from app.models.projet import Projet
from app.models.fichier import Fichier
from app.models.utilisateur import Utilisateur
from app.schemas.fichier import FichierCreate, FichierResponse, FichierListResponse

router = APIRouter(prefix="/projets", tags=["Fichiers"])

# Dossier de stockage des fichiers
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)  # Crée le dossier s'il n'existe pas

# Taille maximale des fichiers (50 MB)
MAX_FILE_SIZE = 50 * 1024 * 1024

# Types MIME autorisés
ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-rar-compressed",
]


def get_file_extension(filename: str) -> str:
    """Récupère l'extension d'un fichier"""
    return Path(filename).suffix


def generate_unique_filename(original_filename: str) -> str:
    """Génère un nom de fichier unique"""
    extension = get_file_extension(original_filename)
    unique_id = uuid.uuid4().hex[:12]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{timestamp}_{unique_id}{extension}"


# ============================================================
# ENDPOINTS FICHIERS
# ============================================================

@router.get("/{projet_id}/fichiers", response_model=List[FichierListResponse])
async def get_projet_fichiers(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Rechercher par nom")
):
    """
    Récupère la liste des fichiers d'un projet (RF-08).
    """
    # Construction de la requête
    query = select(Fichier).where(Fichier.projet_id == projet_id)
    
    if search:
        query = query.where(Fichier.nom.ilike(f"%{search}%"))
    
    query = query.order_by(Fichier.cree_le.desc())
    
    result = await db.execute(query)
    fichiers = result.scalars().all()
    
    return [FichierListResponse.model_validate(f) for f in fichiers]


@router.get("/{projet_id}/fichiers/{fichier_id}", response_model=FichierResponse)
async def get_fichier(
    projet_id: int,
    fichier_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db)
):
    """
    Récupère les détails d'un fichier spécifique.
    """
    # Récupère le fichier
    result = await db.execute(
        select(Fichier).where(
            and_(
                Fichier.id == fichier_id,
                Fichier.projet_id == projet_id
            )
        )
    )
    fichier = result.scalar_one_or_none()
    
    if not fichier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier non trouvé"
        )
    
    # Récupère le nom de l'utilisateur qui a uploadé
    if fichier.televerse_par_id:
        result = await db.execute(
            select(Utilisateur).where(Utilisateur.id == fichier.televerse_par_id)
        )
        utilisateur = result.scalar_one_or_none()
        televerse_par_nom = f"{utilisateur.prenom} {utilisateur.nom}" if utilisateur else None
    else:
        televerse_par_nom = None
    
    response = FichierResponse.model_validate(fichier)
    response.televerse_par_nom = televerse_par_nom
    
    return response


@router.post("/{projet_id}/fichiers", response_model=FichierResponse, status_code=status.HTTP_201_CREATED)
async def upload_fichier(
    projet_id: int,
    file: UploadFile = File(...),
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Upload un fichier dans un projet (RF-08).
    
    **Permissions :** Seule la direction ou le chef de projet peut uploader des fichiers.
    
    **Limitations :**
    - Taille max : 50 MB
    - Types autorisés : images, PDF, Word, Excel, PowerPoint, texte, ZIP, RAR
    """
    # 1. Vérifie la taille du fichier
    file_size = 0
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Le fichier est trop volumineux. Taille max : {MAX_FILE_SIZE // (1024*1024)} MB"
        )
    
    # 2. Vérifie le type MIME
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Type de fichier non autorisé. Types acceptés : {', '.join(ALLOWED_MIME_TYPES)}"
        )
    
    # 3. Génère un nom de fichier unique
    unique_filename = generate_unique_filename(file.filename)
    file_path = UPLOAD_DIR / unique_filename
    
    # 4. Sauvegarde le fichier sur le disque
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la sauvegarde du fichier : {str(e)}"
        )
    
    # 5. Crée l'entrée en base de données
    fichier = Fichier(
        nom=file.filename,
        chemin_ou_url=str(file_path),
        type=file.content_type,
        taille=file_size,
        projet_id=projet_id,
        televerse_par_id=current_user_id,
    )
    
    db.add(fichier)
    await db.commit()
    await db.refresh(fichier)
    
    # 6. Récupère le nom de l'utilisateur
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == current_user_id)
    )
    utilisateur = result.scalar_one_or_none()
    televerse_par_nom = f"{utilisateur.prenom} {utilisateur.nom}" if utilisateur else None
    
    response = FichierResponse.model_validate(fichier)
    response.televerse_par_nom = televerse_par_nom
    
    return response


@router.get("/{projet_id}/fichiers/{fichier_id}/telecharger")
async def telecharger_fichier(
    projet_id: int,
    fichier_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db)
):
    """
    Télécharge un fichier du projet.
    """
    # 1. Récupère le fichier
    result = await db.execute(
        select(Fichier).where(
            and_(
                Fichier.id == fichier_id,
                Fichier.projet_id == projet_id
            )
        )
    )
    fichier = result.scalar_one_or_none()
    
    if not fichier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier non trouvé"
        )
    
    # 2. Vérifie que le fichier existe sur le disque
    file_path = Path(fichier.chemin_ou_url)
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Le fichier n'existe plus sur le serveur"
        )
    
    # 3. Retourne le fichier
    return FileResponse(
        path=file_path,
        filename=fichier.nom,
        media_type=fichier.type or "application/octet-stream",
    )


@router.delete("/{projet_id}/fichiers/{fichier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fichier(
    projet_id: int,
    fichier_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Supprime un fichier du projet (RF-08).
    
    **Permissions :** Seule la direction ou le chef de projet peut supprimer des fichiers.
    """
    # 1. Récupère le fichier
    result = await db.execute(
        select(Fichier).where(
            and_(
                Fichier.id == fichier_id,
                Fichier.projet_id == projet_id
            )
        )
    )
    fichier = result.scalar_one_or_none()
    
    if not fichier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier non trouvé"
        )
    
    # 2. Supprime le fichier du disque
    file_path = Path(fichier.chemin_ou_url)
    if file_path.exists():
        try:
            os.remove(file_path)
        except Exception as e:
            # On continue même si la suppression échoue
            print(f"Erreur lors de la suppression du fichier : {e}")
    
    # 3. Supprime l'entrée en base de données
    await db.delete(fichier)
    await db.commit()
    
    return None


@router.post("/{projet_id}/fichiers/{fichier_id}/renommer", response_model=FichierResponse)
async def renommer_fichier(
    projet_id: int,
    fichier_id: int,
    nouveau_nom: str = Query(..., description="Nouveau nom du fichier"),
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet)
):
    """
    Renomme un fichier.
    
    **Permissions :** Seule la direction ou le chef de projet peut renommer des fichiers.
    """
    # 1. Récupère le fichier
    result = await db.execute(
        select(Fichier).where(
            and_(
                Fichier.id == fichier_id,
                Fichier.projet_id == projet_id
            )
        )
    )
    fichier = result.scalar_one_or_none()
    
    if not fichier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier non trouvé"
        )
    
    # 2. Vérifie que le nouveau nom n'est pas vide
    if not nouveau_nom or len(nouveau_nom.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le nom du fichier ne peut pas être vide"
        )
    
    # 3. Met à jour le nom
    fichier.nom = nouveau_nom.strip()
    await db.commit()
    await db.refresh(fichier)
    
    return FichierResponse.model_validate(fichier)


@router.get("/{projet_id}/fichiers/statistiques")
async def get_fichier_statistiques(
    projet_id: int,
    projet: Projet = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db)
):
    """
    Statistiques des fichiers d'un projet.
    """
    # 1. Nombre total de fichiers
    result = await db.execute(
        select(Fichier).where(Fichier.projet_id == projet_id)
    )
    fichiers = result.scalars().all()
    
    total = len(fichiers)
    
    # 2. Taille totale
    taille_totale = sum(f.taille or 0 for f in fichiers)
    
    # 3. Répartition par type MIME
    types = {}
    for f in fichiers:
        type_mime = f.type or "unknown"
        if type_mime in types:
            types[type_mime] += 1
        else:
            types[type_mime] = 1
    
    return {
        "total_fichiers": total,
        "taille_totale_bytes": taille_totale,
        "taille_totale_mb": round(taille_totale / (1024 * 1024), 2),
        "types": types,
    }