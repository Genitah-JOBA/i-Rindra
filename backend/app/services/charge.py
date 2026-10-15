# app/services/charge.py
"""
Charge de travail par membre (RF-17) et détection de surcharge (RF-18).

Charge d'un membre = ses tâches NON terminées (dont il est responsable) dans
les projets actifs visibles par l'utilisateur, avec le détail :
  - en retard (échéance dépassée) ;
  - priorité haute ;
  - prochaine échéance.

Un membre est en surcharge quand il atteint CHARGE_SEUIL_TACHES tâches
ouvertes OU CHARGE_SEUIL_RETARD tâches en retard (réglables dans .env).
"""
from datetime import date
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.tache import PrioriteTache, StatutTache, Tache
from app.models.utilisateur import Utilisateur


async def charge_par_membre(db: AsyncSession, projet_ids: List[int]) -> List[dict]:
    if not projet_ids:
        return []
    taches = (await db.execute(
        select(Tache).where(
            Tache.projet_id.in_(projet_ids),
            Tache.responsable_id.isnot(None),
            Tache.statut != StatutTache.TERMINE,
        )
    )).scalars().all()
    if not taches:
        return []

    aujourd_hui = date.today()
    par_membre: dict = {}
    for t in taches:
        m = par_membre.setdefault(t.responsable_id, {
            "ouvertes": 0, "en_retard": 0, "haute_priorite": 0, "prochaine_echeance": None, "projets": set(),
        })
        m["ouvertes"] += 1
        m["projets"].add(t.projet_id)
        if t.echeance and t.echeance < aujourd_hui:
            m["en_retard"] += 1
        if t.priorite == PrioriteTache.HAUTE:
            m["haute_priorite"] += 1
        if t.echeance and t.echeance >= aujourd_hui and (
            m["prochaine_echeance"] is None or t.echeance < m["prochaine_echeance"]
        ):
            m["prochaine_echeance"] = t.echeance

    membres = (await db.execute(select(Utilisateur).where(Utilisateur.id.in_(par_membre)))).scalars().all()
    seuil, seuil_retard = settings.CHARGE_SEUIL_TACHES, settings.CHARGE_SEUIL_RETARD
    resultat = []
    for u in membres:
        m = par_membre[u.id]
        resultat.append({
            "utilisateur_id": u.id,
            "nom": f"{u.prenom} {u.nom}".strip(),
            "metier": u.metier,
            "taches_ouvertes": m["ouvertes"],
            "taches_en_retard": m["en_retard"],
            "taches_haute_priorite": m["haute_priorite"],
            "nb_projets": len(m["projets"]),
            "prochaine_echeance": m["prochaine_echeance"],
            "charge_pct": min(100, round(m["ouvertes"] * 100 / seuil)) if seuil else 0,
            "surcharge": m["ouvertes"] >= seuil or m["en_retard"] >= seuil_retard,
        })
    resultat.sort(key=lambda r: (-r["taches_ouvertes"], -r["taches_en_retard"], r["nom"]))
    return resultat


def message_surcharge(membre: dict) -> str:
    detail = f"{membre['taches_ouvertes']} tâche{'s' if membre['taches_ouvertes'] > 1 else ''} ouverte" \
             f"{'s' if membre['taches_ouvertes'] > 1 else ''}"
    if membre["taches_en_retard"]:
        detail += f", dont {membre['taches_en_retard']} en retard"
    return f"{membre['nom']} est en surcharge : {detail}"
