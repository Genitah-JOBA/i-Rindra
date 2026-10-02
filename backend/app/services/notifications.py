# app/services/notifications.py
"""
Service de création de notifications.
Regroupe la logique « qui doit être notifié » pour chaque événement.
Les helpers ajoutent les notifications à la session ; l'appelant fait le commit.
"""
import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.notification import Notification
from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.projet import Projet, ProjetMembre
from app.models.tache import StatutTache, Tache

logger = logging.getLogger(__name__)

# Lien vers le Kanban interne, et lien vers l'espace client : un client n'a pas
# accès à /taches, il doit arriver sur /mon-projet (routes de App.jsx).
LIEN_TACHES_INTERNE = "/taches?projet={projet_id}"
LIEN_TACHES_CLIENT = "/mon-projet"


# ---------- Récupération des destinataires ----------

async def ids_pilotage(db: AsyncSession):
    """Tous les comptes de pilotage : direction ET DRH."""
    res = await db.execute(
        select(Utilisateur.id).where(
            Utilisateur.role.in_([RoleUtilisateur.DIRECTION, RoleUtilisateur.DRH])
        )
    )
    return [r[0] for r in res.all()]


async def ids_gestion(db: AsyncSession):
    """Comptes de gestion : direction, DRH et chef de projet."""
    res = await db.execute(
        select(Utilisateur.id).where(
            Utilisateur.role.in_(
                [
                    RoleUtilisateur.DIRECTION,
                    RoleUtilisateur.DRH,
                    RoleUtilisateur.CHEF_DE_PROJET,
                ]
            )
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


async def ids_equipe_projet(db: AsyncSession, projet_id: int):
    """
    Destinataires « terrain » d'un projet : son chef de projet (colonne
    `responsable_id`) et les membres affectés.

    Volontairement SANS les comptes client : ceux-ci sont traités à part car ils
    n'ont pas accès à /taches (routes de App.jsx) et doivent donc recevoir un
    autre lien. La direction / le DRH sont couverts par `ids_gestion`.
    """
    projet = (
        await db.execute(select(Projet).where(Projet.id == projet_id))
    ).scalar_one_or_none()

    ids = []
    if projet is not None and projet.responsable_id:
        ids.append(projet.responsable_id)
    ids += await ids_membres_projet(db, projet_id)
    return ids


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


# ---------- Événements projet : retard & suppression ----------

def tache_en_retard(tache, aujourdhui: Optional[date] = None) -> bool:
    """
    Une tâche est en retard quand son échéance est dépassée ET qu'elle n'est
    pas terminée. Une tâche sans échéance n'est jamais « en retard ».

    Fonction volontairement pure (pas de session) : c'est la règle métier
    partagée par le scan, le routeur des tâches et les tests.
    """
    if tache.echeance is None:
        return False
    if tache.statut == StatutTache.TERMINE:
        return False
    return tache.echeance < (aujourdhui or date.today())


def jours_de_retard(tache, aujourdhui: Optional[date] = None) -> int:
    """Nombre de jours de retard (0 si la tâche n'est pas en retard)."""
    if not tache_en_retard(tache, aujourdhui):
        return 0
    return ((aujourdhui or date.today()) - tache.echeance).days


def message_retard(tache, aujourdhui: Optional[date] = None) -> str:
    """Message utilisateur d'une alerte de retard, avec le nombre de jours."""
    jours = jours_de_retard(tache, aujourdhui)
    if jours <= 1:
        return f"Tâche « {tache.titre} » en retard sur le projet"
    return f"Tâche « {tache.titre} » en retard de {jours} jours"


async def signaler_retard_tache(db: AsyncSession, tache, auteur_id: int = None):
    """
    Notifie le retard d'UNE tâche : direction, DRH, chef de projet, membres et
    client du projet (sauf l'auteur de l'action en cours).

    Anti-doublon : la colonne `tache.retard_notifie_le` mémorise l'alerte déjà
    envoyée. On ne ré-alerte pas tant que la tâche n'est pas « reparée » (le
    statut repasse à non terminé ou l'échéance est repoussée).
    N'effectue PAS le commit : l'appelant s'en charge.
    """
    projet_id = tache.projet_id
    message = message_retard(tache)

    # Interne (lien /taches?projet=…) : direction, DRH, chefs de projet, équipe.
    destinataires = await ids_gestion(db)
    destinataires += await ids_equipe_projet(db, projet_id)
    destinataires = [d for d in destinataires if d != auteur_id]

    await notifier(
        db,
        destinataires,
        "tache_retard",
        message,
        LIEN_TACHES_INTERNE.format(projet_id=projet_id),
    )

    # Le client n'a pas accès à /taches : on lui adresse son propre espace.
    if projet_id:
        projet = (
            await db.execute(select(Projet).where(Projet.id == projet_id))
        ).scalar_one_or_none()
        if projet is not None:
            clients = [
                c
                for c in await ids_clients_du_projet(db, projet.client_id)
                if c != auteur_id
            ]
            await notifier(db, clients, "tache_retard", message, LIEN_TACHES_CLIENT)

    tache.retard_notifie_le = datetime.now(timezone.utc)


async def signaler_suppression_tache(
    db: AsyncSession, titre: str, projet_id: int, auteur_id: int = None
):
    """
    Notifie la suppression d'une tâche : direction, DRH, chef de projet,
    membres et client du projet (sauf l'auteur de la suppression).
    N'effectue PAS le commit : l'appelant s'en charge.
    """
    destinataires = await ids_gestion(db)
    destinataires += await ids_equipe_projet(db, projet_id)
    destinataires = [d for d in destinataires if d != auteur_id]
    message = f"Tâche « {titre} » supprimée du projet"

    await notifier(
        db,
        destinataires,
        "tache_supprimee",
        message,
        LIEN_TACHES_INTERNE.format(projet_id=projet_id),
    )

    # Le client n'a pas accès à /taches : on lui adresse son propre espace.
    projet = (
        await db.execute(select(Projet).where(Projet.id == projet_id))
    ).scalar_one_or_none()
    if projet is not None:
        clients = [
            c
            for c in await ids_clients_du_projet(db, projet.client_id)
            if c != auteur_id
        ]
        await notifier(db, clients, "tache_supprimee", message, LIEN_TACHES_CLIENT)


async def scanner_taches_en_retard(
    db: AsyncSession, projet_id: Optional[int] = None
) -> int:
    """
    Détecte les tâches en retard jamais notifiées et crée l'alerte.

    - Les tâches d'un projet archivé sont ignorées.
    - Réarmement : dès qu'une tâche n'est plus en retard, son marqueur est
      remis à None — elle pourra donc être re-notifiée si elle repart en retard.
    - Retourne le nombre de tâches alertées.

    N'effectue PAS le commit : l'appelant s'en charge.
    """
    requete = select(Tache).where(
        Tache.echeance.is_not(None),
        Tache.echeance < date.today(),
        Tache.statut != StatutTache.TERMINE,
        Tache.retard_notifie_le.is_(None),
    )
    if projet_id is not None:
        requete = requete.where(Tache.projet_id == projet_id)

    taches = (await db.execute(requete)).scalars().all()
    if not taches:
        return 0

    # Ne pas alerter sur les tâches d'un projet archivé.
    projets = (
        await db.execute(
            select(Projet).where(
                Projet.id.in_({t.projet_id for t in taches}),
                Projet.archive.is_(False),
            )
        )
    ).scalars().all()
    projets_actifs = {p.id for p in projets}

    # Réarmement : une tâche revenue dans les temps peut re-devenir en retard.
    await db.execute(
        update(Tache)
        .where(Tache.retard_notifie_le.is_not(None))
        .where(
            or_(
                Tache.echeance.is_(None),
                Tache.echeance >= date.today(),
                Tache.statut == StatutTache.TERMINE,
            )
        )
        .values(retard_notifie_le=None)
    )

    compte = 0
    for tache in taches:
        if tache.projet_id not in projets_actifs:
            continue
        await signaler_retard_tache(db, tache)
        compte += 1

    return compte


_tache_surveillance: Optional[asyncio.Task] = None


async def boucle_surveillance_retards(intervalle_secondes: int = 3600):
    """
    Tâche de fond : scanne les tâches en retard toutes les `intervalle_secondes`
    et crée les notifications manquantes.

    Indispensable car le retard apparaît tout seul (le temps passe) : aucune
    action utilisateur ne le déclenche. Un échec est journalisé puis la boucle
    repart — elle ne doit jamais mourir en silence.
    """
    while True:
        try:
            await asyncio.sleep(intervalle_secondes)
            async with AsyncSessionLocal() as session:
                n = await scanner_taches_en_retard(session)
                if n:
                    await session.commit()
                    logger.info("%s tâche(s) en retard signalée(s)", n)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Échec du scan des tâches en retard")


def demarrer_surveillance_retards(intervalle_secondes: int = 3600):
    """Démarre la boucle de fond (idempotent)."""
    global _tache_surveillance
    if _tache_surveillance is None or _tache_surveillance.done():
        _tache_surveillance = asyncio.create_task(
            boucle_surveillance_retards(intervalle_secondes)
        )
    return _tache_surveillance


async def arreter_surveillance_retards():
    """Arrête proprement la boucle de fond au shutdown de l'application."""
    global _tache_surveillance
    if _tache_surveillance is not None and not _tache_surveillance.done():
        _tache_surveillance.cancel()
        try:
            await _tache_surveillance
        except asyncio.CancelledError:
            pass
    _tache_surveillance = None
