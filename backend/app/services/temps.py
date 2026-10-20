# app/services/temps.py — temps passé agrégé par projet et par membre (RF-24).
# Les saisies viennent du chronomètre des tâches (RF-23, table saisie_temps).
from typing import Iterable, List

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.projet import Projet
from app.models.saisie_temps import SaisieTemps
from app.models.tache import Tache
from app.models.utilisateur import Utilisateur


def _tri(d: dict) -> List[dict]:
    return sorted(d.values(), key=lambda x: (-x["duree_min"], x["nom"]))


def agreger(lignes: Iterable) -> dict:
    """
    Agrège des lignes (projet_id, projet_nom, utilisateur_id, prenom, nom,
    tache_id, tache_titre, duree_min) — une ligne par couple (tâche, membre).
    Renvoie le total et les répartitions par projet, par membre et par tâche,
    triées de la plus grande durée à la plus petite.
    """
    total = 0
    par_projet, par_membre, par_tache = {}, {}, {}
    for (projet_id, projet_nom, uid, prenom, nom, tache_id, tache_titre, duree) in lignes:
        duree = int(duree or 0)
        total += duree
        p = par_projet.setdefault(projet_id, {"projet_id": projet_id, "nom": projet_nom, "duree_min": 0})
        p["duree_min"] += duree
        m = par_membre.setdefault(uid, {"utilisateur_id": uid, "nom": f"{prenom} {nom}".strip(), "duree_min": 0})
        m["duree_min"] += duree
        t = par_tache.setdefault(tache_id, {"tache_id": tache_id, "nom": tache_titre, "duree_min": 0})
        t["duree_min"] += duree
    return {
        "total_min": total,
        "par_projet": _tri(par_projet),
        "par_membre": _tri(par_membre),
        "par_tache": _tri(par_tache),
    }


async def temps_agrege(db: AsyncSession, projet_ids: List[int], utilisateur_id: int | None = None) -> dict:
    """Temps passé sur les projets donnés (éventuellement limité à un membre)."""
    if not projet_ids:
        return agreger([])
    q = (
        select(
            Projet.id, Projet.nom, Utilisateur.id, Utilisateur.prenom, Utilisateur.nom,
            Tache.id, Tache.titre, func.sum(SaisieTemps.duree_min),
        )
        .join(Tache, SaisieTemps.tache_id == Tache.id)
        .join(Projet, Tache.projet_id == Projet.id)
        .join(Utilisateur, SaisieTemps.utilisateur_id == Utilisateur.id)
        .where(Projet.id.in_(projet_ids))
        .group_by(Projet.id, Projet.nom, Utilisateur.id, Utilisateur.prenom, Utilisateur.nom, Tache.id, Tache.titre)
    )
    if utilisateur_id is not None:
        q = q.where(SaisieTemps.utilisateur_id == utilisateur_id)
    return agreger((await db.execute(q)).all())
