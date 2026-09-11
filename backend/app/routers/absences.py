# app/routers/absences.py
"""
Gestion des absences.
- Équipe, chef de projet, direction/DRH : dépose une demande d'absence.
- Direction/DRH : accepte ou refuse la demande (décision, statistiques réservées).
- La liste globale est accessible au chef de projet, à la direction et au DRH.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.routers.auth import get_current_user_id, get_current_user_role
from app.models.absence import Absence, StatutAbsence
from app.models.utilisateur import Utilisateur
from app.schemas.absence import (
    AbsenceCreate,
    AbsenceDecision,
    AbsenceResponse,
    AbsenceStats,
)
import app.services.notifications as notif_service

router = APIRouter(prefix="/absences", tags=["Absences"])


async def _direction_seulement(role: str = Depends(get_current_user_role)):
    if role not in ("direction", "drh"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Action réservée à la direction",
        )
    return role


def _to_response(a: Absence, user_nom="", user_prenom="", decideur_nom=None) -> AbsenceResponse:
    return AbsenceResponse(
        id=a.id,
        utilisateur_id=a.utilisateur_id,
        utilisateur_nom=user_nom,
        utilisateur_prenom=user_prenom,
        type=a.type,
        date_debut=a.date_debut,
        date_fin=a.date_fin,
        motif=a.motif,
        statut=a.statut,
        decideur_id=a.decideur_id,
        decideur_nom=decideur_nom,
        commentaire=a.commentaire,
        cree_le=a.cree_le,
        decide_le=a.decide_le,
    )


async def _charger_avec_infos(db: AsyncSession):
    """Toutes les absences avec nom/prénom du demandeur + nom du décideur."""
    rows = (
        await db.execute(
            select(Absence, Utilisateur.nom, Utilisateur.prenom, Utilisateur.id)
            .join(Utilisateur, Absence.utilisateur_id == Utilisateur.id)
            .order_by(Absence.cree_le.desc())
        )
    ).all()
    resultat = []
    for a, nom, prenom, uid in rows:
        decideur_nom = None
        if a.decideur_id:
            d = (
                await db.execute(
                    select(Utilisateur.nom, Utilisateur.prenom).where(
                        Utilisateur.id == a.decideur_id
                    )
                )
            ).one_or_none()
            if d:
                decideur_nom = f"{d[1]} {d[0]}"
        resultat.append(_to_response(a, nom, prenom, decideur_nom))
    return resultat


# ------------------------------------------------------------
# STATISTIQUES (direction)
# ------------------------------------------------------------

@router.get("/statistiques", response_model=AbsenceStats)
async def statistiques(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_direction_seulement),
):
    en_attente = (await db.execute(
        select(func.count(Absence.id)).where(Absence.statut == StatutAbsence.EN_ATTENTE)
    )).scalar() or 0
    acceptees = (await db.execute(
        select(func.count(Absence.id)).where(Absence.statut == StatutAbsence.ACCEPTEE)
    )).scalar() or 0
    refusees = (await db.execute(
        select(func.count(Absence.id)).where(Absence.statut == StatutAbsence.REFUSEE)
    )).scalar() or 0
    total = (await db.execute(select(func.count(Absence.id)))).scalar() or 0
    return AbsenceStats(
        en_attente=en_attente,
        acceptees=acceptees,
        refusees=refusees,
        total=total,
    )


# ------------------------------------------------------------
# LISTE — direction : tout ; équipe : ses propres demandes
# ------------------------------------------------------------

@router.get("/", response_model=List[AbsenceResponse])
async def lister_absences(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    role: str = Depends(get_current_user_role),
):
    if role in ("direction", "drh", "chef_de_projet"):
        return await _charger_avec_infos(db)

    if role != "equipe":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'avez pas accès aux absences",
        )

    rows = (
        await db.execute(
            select(Absence, Utilisateur.nom, Utilisateur.prenom, Utilisateur.id)
            .join(Utilisateur, Absence.utilisateur_id == Utilisateur.id)
            .where(Absence.utilisateur_id == user_id)
            .order_by(Absence.cree_le.desc())
        )
    ).all()
    return [
        _to_response(a, nom, prenom)
        for a, nom, prenom, _u in rows
    ]


# ------------------------------------------------------------
# CRÉATION (toute l'équipe + direction)
# ------------------------------------------------------------

@router.post("/", response_model=AbsenceResponse, status_code=status.HTTP_201_CREATED)
async def creer_absence(
    data: AbsenceCreate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    role: str = Depends(get_current_user_role),
):
    # Le client ne dépose pas de demandes d'absence
    if role not in ("equipe", "direction", "drh", "chef_de_projet"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls les membres de l'équipe, le chef de projet, la direction et le DRH peuvent déposer une demande d'absence",
        )

    if data.date_fin < data.date_debut:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date de fin doit être égale ou postérieure à la date de début",
        )

    absence = Absence(
        utilisateur_id=user_id,
        type=data.type,
        date_debut=data.date_debut,
        date_fin=data.date_fin,
        motif=data.motif,
        statut=StatutAbsence.EN_ATTENTE,
    )
    db.add(absence)
    await db.flush()

    # Notification à la direction / DRH
    uid_direction = await notif_service.ids_pilotage(db)
    uid_direction = [uid for uid in uid_direction if uid != user_id]
    await notif_service.notifier(
        db,
        uid_direction,
        "absence_demandee",
        f"Nouvelle demande d'absence ({data.type.value}) du {data.date_debut} au {data.date_fin}",
        "/absences",
    )

    await db.commit()
    await db.refresh(absence)

    demande = (
        await db.execute(select(Utilisateur).where(Utilisateur.id == user_id))
    ).scalar_one()
    return _to_response(absence, demande.nom, demande.prenom)


# ------------------------------------------------------------
# DÉCISION (direction uniquement)
# ------------------------------------------------------------

@router.patch("/{absence_id}/decision", response_model=AbsenceResponse)
async def decider_absence(
    absence_id: int,
    data: AbsenceDecision,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    _: str = Depends(_direction_seulement),
):
    a = (await db.execute(select(Absence).where(Absence.id == absence_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Demande d'absence non trouvée")

    if data.statut == StatutAbsence.EN_ATTENTE:
        raise HTTPException(
            status_code=400,
            detail="La décision doit être 'acceptee' ou 'refusee'",
        )

    a.statut = data.statut
    a.decideur_id = user_id
    a.decide_le = datetime.now()
    if data.commentaire:
        a.commentaire = data.commentaire

    # Notification au demandeur
    message = (
        "Votre demande d'absence a été acceptée"
        if data.statut == StatutAbsence.ACCEPTEE
        else "Votre demande d'absence a été refusée"
    )
    if data.commentaire:
        message += f" : {data.commentaire}"
    await notif_service.notifier(
        db,
        [a.utilisateur_id],
        "absence_decision",
        message,
        "/absences",
    )

    await db.commit()
    await db.refresh(a)

    demande = (
        await db.execute(select(Utilisateur).where(Utilisateur.id == a.utilisateur_id))
    ).scalar_one()
    decideur_nom = None
    if a.decideur_id:
        d = (await db.execute(select(Utilisateur).where(Utilisateur.id == a.decideur_id))).scalar_one_or_none()
        if d:
            decideur_nom = f"{d.prenom} {d.nom}"
    return _to_response(a, demande.nom, demande.prenom, decideur_nom)


# ------------------------------------------------------------
# ANNULATION (l'auteur : sa propre demande en attente)
# ------------------------------------------------------------

@router.delete("/{absence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def annuler_absence(
    absence_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    role: str = Depends(get_current_user_role),
):
    a = (await db.execute(select(Absence).where(Absence.id == absence_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Demande d'absence non trouvée")

    # La direction peut supprimer n'importe quelle demande ; un membre seulement la sienne
    if role not in ("direction", "drh") and a.utilisateur_id != user_id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas supprimer cette demande")

    await db.delete(a)
    await db.commit()
    return None