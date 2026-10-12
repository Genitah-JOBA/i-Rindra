# app/services/alertes_internes.py
"""
Alertes de pilotage envoyées en NOTIFICATIONS à l'équipe interne (RF-18).

Complète la surveillance des tâches en retard (notifications.py) avec :
  - surcharge d'un membre      -> gestion (direction, DRH, chefs de projet) + le membre ;
  - projet en retard           -> gestion + équipe du projet ;
  - projet en statut rouge     -> gestion + équipe du projet ;
  - échéance proche d'une tâche -> son responsable.

Jamais aux comptes client (ils gardent les alertes de leur espace « Mon projet »).

Anti-doublon : chaque alerte est mémorisée (colonne *_notifie_le / date notifiée)
et n'est renvoyée que si la situation disparaît puis réapparaît (« réarmement »).
Les fonctions n'effectuent PAS le commit : l'appelant s'en charge.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.projet import Projet, StatutSante
from app.models.tache import StatutTache, Tache
from app.models.utilisateur import RoleUtilisateur, Utilisateur
from app.services import charge as charge_service
from app.services import notifications as notif

LIEN_PROJET = "/projets/{projet_id}"
LIEN_TACHES = "/taches?projet={projet_id}"
LIEN_DASHBOARD = "/"


def _maintenant():
    return datetime.now(timezone.utc)


async def _sans_clients(db: AsyncSession, ids):
    """Retire les comptes client d'une liste de destinataires (sécurité)."""
    ids = [i for i in dict.fromkeys(ids) if i]
    if not ids:
        return []
    clients = (await db.execute(
        select(Utilisateur.id).where(Utilisateur.id.in_(ids), Utilisateur.role == RoleUtilisateur.CLIENT)
    )).scalars().all()
    return [i for i in ids if i not in set(clients)]


async def _equipe_et_gestion(db: AsyncSession, projet_id: int):
    return await _sans_clients(db, await notif.ids_gestion(db) + await notif.ids_equipe_projet(db, projet_id))


async def scanner_projets(db: AsyncSession) -> int:
    """Projets actifs en retard ou passés au rouge (une notification par épisode)."""
    projets = (await db.execute(select(Projet).where(Projet.archive.is_(False)))).scalars().all()
    aujourd_hui, compte = date.today(), 0
    for p in projets:
        en_retard = bool(p.date_fin_prevue and p.date_fin_prevue < aujourd_hui and (p.avancement_pct or 0) < 100)
        if en_retard and p.retard_notifie_le is None:
            jours = (aujourd_hui - p.date_fin_prevue).days
            await notif.notifier(db, await _equipe_et_gestion(db, p.id), "projet_retard",
                                 f"Le projet « {p.nom} » est en retard de {jours} jour{'s' if jours > 1 else ''}.",
                                 LIEN_PROJET.format(projet_id=p.id))
            p.retard_notifie_le = _maintenant()
            compte += 1
        elif not en_retard and p.retard_notifie_le is not None:
            p.retard_notifie_le = None  # réarmement

        rouge = p.statut_sante == StatutSante.ROUGE
        if rouge and p.rouge_notifie_le is None:
            await notif.notifier(db, await _equipe_et_gestion(db, p.id), "projet_rouge",
                                 f"Le projet « {p.nom} » est en statut critique (rouge).",
                                 LIEN_PROJET.format(projet_id=p.id))
            p.rouge_notifie_le = _maintenant()
            compte += 1
        elif not rouge and p.rouge_notifie_le is not None:
            p.rouge_notifie_le = None
    return compte


async def scanner_echeances(db: AsyncSession) -> int:
    """Rappel au responsable quand une tâche arrive à échéance (une fois par échéance)."""
    aujourd_hui = date.today()
    limite = aujourd_hui + timedelta(days=settings.RAPPEL_ECHEANCE_JOURS)
    taches = (await db.execute(
        select(Tache).join(Projet, Projet.id == Tache.projet_id).where(
            Projet.archive.is_(False),
            Tache.responsable_id.isnot(None),
            Tache.statut != StatutTache.TERMINE,
            Tache.echeance >= aujourd_hui,
            Tache.echeance <= limite,
        )
    )).scalars().all()
    compte = 0
    for t in taches:
        if t.echeance_rappelee == t.echeance:
            continue  # déjà rappelée pour CETTE échéance (repoussée -> nouveau rappel)
        destinataires = await _sans_clients(db, [t.responsable_id])
        if destinataires:
            jours = (t.echeance - aujourd_hui).days
            quand = "aujourd'hui" if jours == 0 else ("demain" if jours == 1 else f"le {t.echeance:%d/%m/%Y}")
            await notif.notifier(db, destinataires, "deadline_approche",
                                 f"La tâche « {t.titre} » arrive à échéance {quand}.",
                                 LIEN_TACHES.format(projet_id=t.projet_id))
            compte += 1
        t.echeance_rappelee = t.echeance
    return compte


async def scanner_surcharge(db: AsyncSession) -> int:
    """Membres en surcharge (seuils CHARGE_SEUIL_*), une notification par épisode."""
    ids_projets = list((await db.execute(select(Projet.id).where(Projet.archive.is_(False)))).scalars().all())
    charge = {m["utilisateur_id"]: m for m in await charge_service.charge_par_membre(db, ids_projets)}
    en_surcharge = {uid for uid, m in charge.items() if m["surcharge"]}

    # Réarmement : membres sortis de surcharge
    for u in (await db.execute(select(Utilisateur).where(Utilisateur.surcharge_notifiee_le.isnot(None)))).scalars():
        if u.id not in en_surcharge:
            u.surcharge_notifiee_le = None

    compte = 0
    gestion = await notif.ids_gestion(db)
    for uid in en_surcharge:
        membre = (await db.execute(select(Utilisateur).where(Utilisateur.id == uid))).scalar_one()
        if membre.surcharge_notifiee_le is not None:
            continue
        await notif.notifier(db, await _sans_clients(db, gestion + [uid]), "surcharge",
                             charge_service.message_surcharge(charge[uid]) + ".", LIEN_DASHBOARD)
        membre.surcharge_notifiee_le = _maintenant()
        compte += 1
    return compte


async def scanner_alertes_internes(db: AsyncSession) -> int:
    return await scanner_projets(db) + await scanner_echeances(db) + await scanner_surcharge(db)
