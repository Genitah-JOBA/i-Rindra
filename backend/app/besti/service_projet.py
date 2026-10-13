# app/besti/service_projet.py
"""
Règles métier des projets Besti (événements `project.*`).

Point d'entrée : `appliquer_evenement_projet(db, evenement, corps)`, appelé par
le webhook APRÈS la vérification de signature.

Invariants tenus ici :

* **Consultation seule.** iRindra reflète le dernier instantané de Besti ; rien
  n'est jamais écrit dans l'autre sens.
* **Jamais de compte créé par un projet.** Un `bestiId` sans compte lié répond
  503 : Besti réessaiera, le compte arrivant normalement avant ses projets.
* **Un instantané s'applique en entier ou pas du tout** : une seule
  transaction par événement.
* **Ordre et rejeu.** Un instantané dont `updatedAt` n'est pas plus récent que
  celui enregistré est ignoré (204) : un envoi rejoué ou arrivé en retard ne
  change rien et n'ajoute aucune ligne d'historique.
* **Jamais d'effacement d'un projet** : `project.deleted` archive. Les cahiers,
  fichiers et liens absents d'un instantané sont en revanche supprimés : ce ne
  sont que des métadonnées dont Besti est le seul maître, et un fichier retiré
  n'est de toute façon plus téléchargeable chez Besti.
"""
import logging
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.besti.schemas_projet import (
    BestiCahierInfo,
    BestiProjetInstantane,
    BestiProjetSupprime,
)
from app.models.besti_projet import (
    MOTIF_COMPTE_DESACTIVE,
    MOTIF_SUPPRIME_BESTI,
    BestiCahier,
    BestiFichier,
    BestiLien,
    BestiProjet,
    BestiStatutHistorique,
)
from app.models.utilisateur import Utilisateur

logger = logging.getLogger("i-rindra.besti")

EVENEMENTS_PROJET = ("project.created", "project.updated", "project.deleted")

MESSAGE_INDISPONIBLE = "Traitement momentanément impossible, réessayez plus tard"


def _utc(moment: datetime | None) -> datetime | None:
    """Ramène une date en UTC ; une date sans fuseau est supposée UTC."""
    if moment is None:
        return None
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _valider(schema: type[BaseModel], corps: bytes):
    try:
        return schema.model_validate_json(corps)
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Projet Besti invalide",
        )


def _lien_sur(url: str) -> bool:
    """Seuls les liens http(s) sont affichés : un `javascript:` serait exécuté
    au clic dans le navigateur du client."""
    try:
        return urlsplit(url.strip()).scheme.lower() in ("http", "https")
    except ValueError:
        return False


async def _compte_lie(db: AsyncSession, besti_id) -> Utilisateur:
    resultat = await db.execute(select(Utilisateur).where(Utilisateur.besti_id == besti_id))
    utilisateur = resultat.scalar_one_or_none()
    if utilisateur is None:
        # Le compte arrive normalement avant ses projets : 503 pour que Besti
        # réessaie. Aucun compte n'est créé à partir d'un projet.
        logger.info("Événement projet Besti pour un client inconnu : 503.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Client Besti inconnu, réessayez plus tard",
        )
    return utilisateur


async def _projet(db: AsyncSession, projet_id) -> BestiProjet | None:
    resultat = await db.execute(
        select(BestiProjet).where(BestiProjet.besti_projet_id == projet_id)
    )
    return resultat.scalar_one_or_none()


def _remplacer_cahiers(projet: BestiProjet, specifications: list[BestiCahierInfo]) -> None:
    """
    Aligne cahiers, fichiers et liens sur l'instantané.

    Les éléments existants sont RÉUTILISÉS par identifiant Besti (même s'ils
    changent de cahier) : supprimer puis recréer un même identifiant dans une
    transaction violerait l'unicité. Ce qui n'est plus dans l'instantané
    devient orphelin et est supprimé (cascade `delete-orphan`).
    """
    cahiers = {c.besti_cahier_id: c for c in projet.cahiers}
    fichiers = {f.besti_fichier_id: f for c in projet.cahiers for f in c.fichiers}
    liens = {l.besti_lien_id: l for c in projet.cahiers for l in c.liens}

    nouveaux_cahiers, vus = [], set()
    for ordre, spec in enumerate(specifications):
        if spec.specificationId in vus:
            continue
        vus.add(spec.specificationId)

        cahier = cahiers.get(spec.specificationId) or BestiCahier(
            besti_cahier_id=spec.specificationId
        )
        cahier.ordre = ordre
        cahier.titre = spec.title
        cahier.description = spec.description
        cahier.soumis_le = spec.submittedOn
        cahier.statut_code = spec.status.code if spec.status else None
        cahier.statut_libelle = spec.status.label if spec.status else None

        nouveaux_fichiers = []
        for info in spec.files:
            if info.fileId in vus:
                continue
            vus.add(info.fileId)
            fichier = fichiers.get(info.fileId) or BestiFichier(besti_fichier_id=info.fileId)
            fichier.nom = info.name
            fichier.type_mime = info.mimeType
            fichier.taille_octets = info.sizeBytes
            fichier.ajoute_le = _utc(info.addedAt)
            nouveaux_fichiers.append(fichier)
        cahier.fichiers = nouveaux_fichiers

        nouveaux_liens = []
        for info in spec.links:
            if info.linkId in vus:
                continue
            vus.add(info.linkId)
            if not _lien_sur(info.url):
                logger.warning("Lien Besti non http(s) ignoré (lien %s).", info.linkId)
                continue
            lien = liens.get(info.linkId) or BestiLien(besti_lien_id=info.linkId)
            lien.url = info.url.strip()
            lien.libelle = info.label
            lien.fournisseur = info.provider
            nouveaux_liens.append(lien)
        cahier.liens = nouveaux_liens

        nouveaux_cahiers.append(cahier)

    projet.cahiers = nouveaux_cahiers


async def _appliquer_instantane(db: AsyncSession, instantane: BestiProjetInstantane) -> None:
    compte = await _compte_lie(db, instantane.bestiId)
    projet = await _projet(db, instantane.projectId)
    maj = _utc(instantane.updatedAt)

    if projet is not None and maj <= _utc(projet.maj_besti_le):
        logger.info("Instantané Besti déjà appliqué ou plus ancien : ignoré.")
        return

    if projet is None:
        projet = BestiProjet(besti_projet_id=instantane.projectId)
        db.add(projet)
        statut_change = True
    else:
        statut_change = projet.statut_code != instantane.status.code

    projet.utilisateur_id = compte.id
    projet.nom = instantane.name
    projet.description = instantane.description
    projet.cree_le_besti = instantane.createdOn
    projet.echeance_souhaitee = instantane.desiredDeadline
    projet.statut_code = instantane.status.code
    projet.statut_libelle = instantane.status.label
    projet.statut_depuis = _utc(instantane.status.since)
    projet.maj_besti_le = maj

    if statut_change:
        projet.historique.append(
            BestiStatutHistorique(
                code=instantane.status.code,
                libelle=instantane.status.label,
                depuis=_utc(instantane.status.since) or maj,
            )
        )

    if not compte.actif:
        # Compte désactivé : le projet reste (ou devient) archivé avec lui.
        if projet.archive_le is None:
            projet.archive_le = datetime.now(timezone.utc)
            projet.motif_archivage = MOTIF_COMPTE_DESACTIVE
    elif projet.archive_le is not None:
        # Un instantané plus récent qu'une suppression désarchive le projet.
        projet.archive_le = None
        projet.motif_archivage = None

    _remplacer_cahiers(projet, instantane.specifications)
    await db.commit()


async def _archiver_supprime(db: AsyncSession, suppression: BestiProjetSupprime) -> None:
    compte = await _compte_lie(db, suppression.bestiId)
    projet = await _projet(db, suppression.projectId)

    if projet is None or projet.utilisateur_id != compte.id:
        # Projet inconnu d'un client connu : rien à archiver.
        logger.info("Suppression Besti d'un projet inconnu : ignorée.")
        return

    quand = _utc(suppression.deletedAt)
    if projet.motif_archivage == MOTIF_SUPPRIME_BESTI or quand < _utc(projet.maj_besti_le):
        logger.info("Suppression Besti déjà appliquée ou plus ancienne : ignorée.")
        return

    projet.archive_le = quand
    projet.motif_archivage = MOTIF_SUPPRIME_BESTI
    # Un instantané antérieur à la suppression, arrivé en retard, sera ignoré.
    projet.maj_besti_le = quand
    await db.commit()


async def appliquer_evenement_projet(db: AsyncSession, evenement: str, corps: bytes) -> None:
    """
    Applique un événement `project.*` (corps brut déjà authentifié).

    Lève `HTTPException` 400 (corps invalide) ou 503 (client inconnu, erreur
    temporaire de la base).
    """
    if evenement == "project.deleted":
        donnees = _valider(BestiProjetSupprime, corps)
        traitement = _archiver_supprime
    else:
        donnees = _valider(BestiProjetInstantane, corps)
        traitement = _appliquer_instantane

    try:
        await traitement(db, donnees)
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Échec d'application d'un événement projet Besti.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MESSAGE_INDISPONIBLE,
        )


async def archiver_projets_du_compte(db: AsyncSession, utilisateur_id: int) -> None:
    """Archive les projets actifs d'un compte désactivé (sans valider)."""
    await db.execute(
        update(BestiProjet)
        .where(BestiProjet.utilisateur_id == utilisateur_id, BestiProjet.archive_le.is_(None))
        .values(archive_le=datetime.now(timezone.utc), motif_archivage=MOTIF_COMPTE_DESACTIVE)
    )


async def desarchiver_projets_du_compte(db: AsyncSession, utilisateur_id: int) -> None:
    """
    Rend visibles les projets archivés PAR la désactivation du compte (sans
    valider). Un projet supprimé dans Besti reste archivé.
    """
    await db.execute(
        update(BestiProjet)
        .where(
            BestiProjet.utilisateur_id == utilisateur_id,
            BestiProjet.motif_archivage == MOTIF_COMPTE_DESACTIVE,
        )
        .values(archive_le=None, motif_archivage=None)
    )
