# app/routers/notifications.py
"""
Notifications de l'utilisateur connecté.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

from app.core.database import get_db, AsyncSessionLocal
from app.routers.auth import get_current_user_id
from app.models.notification import Notification
from app.services import notifications as notif_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


async def _detecter_retards():
    """
    Opportuniste : à chaque lecture de la cloche, on regarde si une tâche est
    devenue en retard depuis la dernière fois.

    La boucle de fond (démarrée dans main.py) reste le filet de sécurité — elle
    couvre le cas où personne n'a d'onglet ouvert. Ce passage ici rend l'alerte
    quasi immédiate dès qu'un utilisateur se connecte, sans la dupliquer (le
    marqueur `retard_notifie_le` garantit l'unicité).

    Session VOLONTAIREMENT séparée de celle de la requête : ce scan écrit en
    base, et le commit ne doit surtout pas emmener avec lui une transaction de
    lecture en cours sur le chemin de l'appelant.
    """
    try:
        async with AsyncSessionLocal() as session:
            n = await notif_service.scanner_taches_en_retard(session)
            if n:
                await session.commit()
    except Exception:
        # Une alerte ne doit jamais faire échouer la lecture des notifications.
        logger.exception("Scan des tâches en retard interrompu")


class NotificationResponse(BaseModel):
    id: int
    type: str
    message: str
    lien: Optional[str] = None
    lu: bool
    cree_le: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


@router.get("/", response_model=List[NotificationResponse])
async def mes_notifications(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Mes notifications (les plus récentes d'abord)."""
    await _detecter_retards()

    res = await db.execute(
        select(Notification)
        .where(Notification.destinataire_id == user_id)
        .order_by(Notification.cree_le.desc())
        .limit(50)
    )
    return res.scalars().all()


@router.get("/count")
async def nombre_non_lues(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Nombre de notifications non lues (pour le badge)."""
    # La cloche interroge ce endpoint toutes les 30 s : c'est le point de
    # passage naturel pour détecter les nouveaux retards.
    await _detecter_retards()

    res = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.destinataire_id == user_id,
            Notification.lu == False,  # noqa: E712
        )
    )
    return {"non_lues": res.scalar() or 0}


@router.patch("/{notification_id}/lue", response_model=NotificationResponse)
async def marquer_lue(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Marque une notification comme lue."""
    res = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notif = res.scalar_one_or_none()
    if not notif or notif.destinataire_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification introuvable"
        )
    notif.lu = True
    await db.commit()
    await db.refresh(notif)
    return notif


@router.patch("/toutes-lues")
async def tout_marquer_lu(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Marque toutes mes notifications comme lues."""
    await db.execute(
        update(Notification)
        .where(Notification.destinataire_id == user_id, Notification.lu == False)  # noqa: E712
        .values(lu=True)
    )
    await db.commit()
    return {"message": "Toutes les notifications sont marquées comme lues"}
