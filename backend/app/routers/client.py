# app/routers/client.py
"""
Routes pour l'espace client (RF-19 à RF-22).
Le client ne voit que SON projet.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session  # Utiliser Session au lieu de AsyncSession pour la simplicité
from sqlalchemy import select, and_, func
from datetime import date
from typing import Optional

# Correction : importer depuis core.database
from app.core.database import get_db
from app.core.security import decode_access_token
from app.routers.auth import oauth2_scheme
from app.models.projet import Projet, StatutSante
from app.models.tache import Tache, StatutTache
from app.schemas.projet import ProjetResponse
from app.schemas.tache import TacheListResponse

router = APIRouter(prefix="/client", tags=["Espace Client"])

def _get_projet_du_client(db: Session, token: str) -> Optional[Projet]:
    """
    Vérifie que l'appelant est un client valide et renvoie son projet actif
    (ou None). Lève 403/400 si le compte n'est pas un client rattaché.
    """
    payload = decode_access_token(token)
    role = payload.get("role")
    client_id = payload.get("client_id")

    if role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cette route est réservée aux clients",
        )
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Votre compte client n'est pas associé à un client",
        )

    # Un client peut avoir plusieurs projets : on prend le plus récent actif.
    projet = db.query(Projet).filter(
        and_(Projet.client_id == client_id, Projet.archive == False)
    ).order_by(Projet.cree_le.desc()).first()
    
    return projet


@router.get("/mon-projet", response_model=ProjetResponse)
async def get_client_projet(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Récupère le projet du client connecté (RF-19, RF-22)."""
    projet = _get_projet_du_client(db, token)
    if not projet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun projet trouvé pour ce client",
        )
    return ProjetResponse.model_validate(projet)


@router.get("/mon-projet/taches", response_model=list[TacheListResponse])
async def get_client_taches(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    statut: Optional[StatutTache] = None,
):
    """Récupère les tâches du projet du client (RF-19)."""
    projet = _get_projet_du_client(db, token)
    if not projet:
        return []

    query = db.query(Tache).filter(Tache.projet_id == projet.id)
    if statut:
        query = query.filter(Tache.statut == statut)
    query = query.order_by(Tache.statut, Tache.ordre)

    return [TacheListResponse.model_validate(t) for t in query.all()]


@router.get("/mon-projet/statut")
async def get_client_statut(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Résumé du projet pour le client (RF-20, RF-21)."""
    projet = _get_projet_du_client(db, token)
    if not projet:
        return {"message": "Aucun projet actif", "has_project": False}

    total_taches = db.query(Tache).filter(Tache.projet_id == projet.id).count()
    taches_terminees = db.query(Tache).filter(
        and_(Tache.projet_id == projet.id, Tache.statut == StatutTache.TERMINE)
    ).count()

    # En retard : date de fin dépassée
    en_retard = bool(projet.date_fin_prevue and projet.date_fin_prevue < date.today())

    return {
        "has_project": True,
        "projet_id": projet.id,
        "projet_nom": projet.nom,
        "statut_sante": projet.statut_sante.value,
        "avancement_pct": projet.avancement_pct,
        "total_taches": total_taches,
        "taches_terminees": taches_terminees,
        "date_debut": projet.date_debut,
        "date_fin_prevue": projet.date_fin_prevue,
        "en_retard": en_retard,
    }


@router.get("/mon-projet/avancement")
async def get_client_avancement(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Avancement détaillé du projet pour le client (RF-21)."""
    projet = _get_projet_du_client(db, token)
    if not projet:
        return {"avancement": 0, "message": "Aucun projet actif"}

    # Récupérer les statistiques des tâches
    stats = {}
    for statut in StatutTache:
        count = db.query(Tache).filter(
            and_(Tache.projet_id == projet.id, Tache.statut == statut)
        ).count()
        stats[statut.value] = count
    
    total = sum(stats.values()) or 1

    return {
        "projet_id": projet.id,
        "projet_nom": projet.nom,
        "avancement_pct": projet.avancement_pct,
        "statut_sante": projet.statut_sante.value,
        "details": {
            "a_faire": stats.get("a_faire", 0),
            "en_cours": stats.get("en_cours", 0),
            "termine": stats.get("termine", 0),
        },
        "total_taches": total,
    }