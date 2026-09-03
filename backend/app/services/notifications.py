# app/services/notifications.py
"""
Service de création de notifications.
Regroupe la logique « qui doit être notifié » pour chaque événement.
Les helpers ajoutent les notifications à la session ; l'appelant fait le commit.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.projet import ProjetMembre


# ---------- Récupération des destinataires ----------

async def ids_direction(db: AsyncSession):
    """Tous les comptes de pilotage : admin ET direction."""
    res = await db.execute(
        select(Utilisateur.id).where(
            Utilisateur.role.in_([RoleUtilisateur.ADMIN, RoleUtilisateur.DIRECTION])
        )
    )
    return [r[0] for r in res.all()]


async def ids_membres_projet(db: AsyncSession, projet_id: int):
    """Tous les utilisateurs affectés au projet (équipe)."""
    res = await db.execute(
        select(ProjetMembre.utilisateur_id).where(ProjetMembre.projet_id == projet_id)
    )
    return [r[0] for r in res.all()]


async def ids_clients_du_projet(db: AsyncSession, client_id):
    """Les comptes 'client' rattachés au client du projet."""
    if not client_id:
        return []
    res = await db.execute(
        select(Utilisateur.id).where(
            Utilisateur.role == RoleUtilisateur.CLIENT,
            Utilisateur.client_id == client_id,
        )
    )
    return [r[0] for r in res.all()]


# ---------- Création ----------

async def notifier(db: AsyncSession, destinataire_ids, type_notif: str, message: str, lien: str = None):
    """
    Crée une notification par destinataire (doublons ignorés).
    N'effectue PAS le commit : l'appelant s'en charge.
    """
    vus = set()
    for uid in destinataire_ids:
        if uid is None or uid in vus:
            continue
        vus.add(uid)
        db.add(
            Notification(
                destinataire_id=uid,
                type=type_notif,
                message=message,
                lien=lien,
            )
        )
