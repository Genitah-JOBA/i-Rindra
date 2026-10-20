# app/besti/service_import.py
"""
Import auto des projets Besti dans la table `projet` interne.

Objectif (base seule) : chaque projet Besti devient un projet suivi iRindra
avec les seuls champs communs aux deux entités — nom, description, dates,
client — sans toucher au reste de l'application (tâches, jalons, membres,
santé, avancement gardent leur vie propre côté iRindra).

Règles :
* une seule ligne `projet` par `besti_projet_id` (colonne unique, upsert) ;
* `client_id` repris de la fiche du compte lié (jamais deviné) ;
* `responsable_id` reste NULL (assigné plus tard par la gestion), santé `vert`,
  avancement `0`, jamais écrasés par les webhooks suivants ;
* `archive` suit le miroir (`archive_le is not None`) : suppression Besti ou
  compte désactivé → archivé, instantané plus récent → désarchivé ;
* équipe (`team`, affectations Besti) : chaque membre de l'agence affecté dans
  Besti est rattaché au compte interne de même email (jamais créé, jamais un
  client) ; retiré seulement s'il avait été ajouté par Besti. Le premier
  affecté devient responsable si le projet n'en a pas encore ;
* aucune validation/commit ici : l'appelant (`service_projet`) commite la
  transaction miroir + suivi ensemble, ou rollback tout.
"""
import logging

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.besti_projet import BestiProjet
from app.models.client import Client
from app.models.projet import Projet, ProjetMembre, StatutSante
from app.models.utilisateur import RoleUtilisateur, Utilisateur

logger = logging.getLogger("i-rindra.besti")


async def _suivi_par_besti_id(db: AsyncSession, besti_projet_id) -> Projet | None:
    resultat = await db.execute(
        select(Projet).where(Projet.besti_projet_id == besti_projet_id)
    )
    return resultat.scalar_one_or_none()


def _appliquer_champs(suivi: Projet, client_id: int, miroir: BestiProjet) -> None:
    """Copie les champs communs Besti -> projet suivi (jamais le pilotage)."""
    suivi.client_id = client_id
    suivi.nom = miroir.nom
    suivi.description = miroir.description
    suivi.date_debut = miroir.cree_le_besti
    suivi.date_fin_prevue = miroir.echeance_souhaitee
    suivi.archive = miroir.archive_le is not None


async def assurer_projet_suivi(db: AsyncSession, compte, miroir: BestiProjet) -> Projet:
    """
    Crée ou met à jour le projet suivi correspondant au miroir donné.

    Si la fiche client du compte est absente (compte ancien ou de test),
    elle est créée à la volée comme dans `service.py`, pour ne pas bloquer
    l'import en 503.
    """
    if compte.client_id is None:
        nom_complet = f"{compte.prenom or ''} {compte.nom or ''}".strip() or compte.email
        fiche = Client(nom=nom_complet, contact=nom_complet or None, email=compte.email)
        db.add(fiche)
        await db.flush()
        compte.client_id = fiche.id
        logger.info("Fiche client créée à la volée pour l'import Besti.")

    suivi = await _suivi_par_besti_id(db, miroir.besti_projet_id)
    if suivi is None:
        suivi = Projet(
            nom=miroir.nom,
            description=miroir.description,
            client_id=compte.client_id,
            responsable_id=None,
            date_debut=miroir.cree_le_besti,
            date_fin_prevue=miroir.echeance_souhaitee,
            statut_sante=StatutSante.VERT,
            avancement_pct=0,
            archive=miroir.archive_le is not None,
            besti_projet_id=miroir.besti_projet_id,
        )
        db.add(suivi)
        logger.info("Projet suivi créé depuis Besti (%s).", miroir.besti_projet_id)
    else:
        _appliquer_champs(suivi, compte.client_id, miroir)
    await db.flush()
    return suivi


async def archiver_projet_suivi(db: AsyncSession, besti_projet_id) -> None:
    """Archive le projet suivi d'un projet Besti supprimé (sans valider)."""
    await db.execute(
        update(Projet)
        .where(Projet.besti_projet_id == besti_projet_id)
        .values(archive=True)
    )


async def archiver_projets_suivis_du_compte(db: AsyncSession, utilisateur_id: int) -> None:
    """Archive les projets suivis d'un compte désactivé (sans valider)."""
    ids = (
        await db.execute(
            select(BestiProjet.besti_projet_id).where(
                BestiProjet.utilisateur_id == utilisateur_id
            )
        )
    ).scalars().all()
    if not ids:
        return
    await db.execute(
        update(Projet)
        .where(Projet.besti_projet_id.in_(ids))
        .values(archive=True)
    )


async def desarchiver_projets_suivis_du_compte(db: AsyncSession, utilisateur_id: int) -> None:
    """
    Désarchive les projets suivis réactivés (sans valider).

    Seuls les miroirs redevenus actifs rouvrent leur suivi : un projet
    supprimé dans Besti garde `archive_le` et reste archivé des deux côtés.
    """
    ids = (
        await db.execute(
            select(BestiProjet.besti_projet_id).where(
                BestiProjet.utilisateur_id == utilisateur_id,
                BestiProjet.archive_le.is_(None),
            )
        )
    ).scalars().all()
    if not ids:
        return
    await db.execute(
        update(Projet)
        .where(
            Projet.besti_projet_id.in_(ids),
            Projet.archive.is_(True),
        )
        .values(archive=False)
    )


async def synchroniser_equipe(db: AsyncSession, suivi: Projet, equipe) -> None:
    """
    Aligne l'équipe du projet suivi sur les affectations Besti (sans valider).

    Les comptes internes sont retrouvés par email : Besti et iRindra gardent
    chacun leurs comptes du personnel, l'email est le seul point commun.
    Un email sans compte interne actif est ignoré (journalisé, sans contenu).
    """
    emails = {(a.email or "").strip().lower() for a in equipe if (a.email or "").strip()}
    comptes = []
    if emails:
        comptes = (
            await db.execute(
                select(Utilisateur).where(
                    func.lower(Utilisateur.email).in_(emails),
                    Utilisateur.actif == True,  # noqa: E712
                    Utilisateur.role != RoleUtilisateur.CLIENT,
                )
            )
        ).scalars().all()
    if len(comptes) < len(emails):
        logger.info("Affectation Besti : %d membre(s) sans compte interne, ignoré(s).", len(emails) - len(comptes))

    # ordre des affectations Besti : le premier affecté peut devenir responsable
    rang = {e: i for i, e in enumerate((a.email or "").strip().lower() for a in equipe)}
    comptes = sorted(comptes, key=lambda u: rang.get(u.email.lower(), 0))
    ids_affectes = {u.id for u in comptes}

    existants = {
        m.utilisateur_id: m
        for m in (
            await db.execute(select(ProjetMembre).where(ProjetMembre.projet_id == suivi.id))
        ).scalars().all()
    }

    # Retraits : seulement les membres venus de Besti
    retires = [uid for uid, m in existants.items() if m.ajoute_par_besti and uid not in ids_affectes]
    if retires:
        await db.execute(
            delete(ProjetMembre).where(
                ProjetMembre.projet_id == suivi.id, ProjetMembre.utilisateur_id.in_(retires)
            )
        )
        if suivi.responsable_id in retires:
            suivi.responsable_id = None

    if suivi.responsable_id is None and comptes:
        suivi.responsable_id = comptes[0].id

    for u in comptes:
        role = "responsable" if u.id == suivi.responsable_id else "membre"
        if u.id not in existants:
            db.add(ProjetMembre(projet_id=suivi.id, utilisateur_id=u.id,
                                role_dans_projet=role, ajoute_par_besti=True))
        elif u.id == suivi.responsable_id:
            existants[u.id].role_dans_projet = "responsable"
    await db.flush()
