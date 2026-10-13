# app/routers/besti_client.py
"""
Projets Besti du client connecté : CONSULTATION SEULE.

Toutes les routes sont en lecture (GET). Le client ne voit que les projets de
SON compte ; un identifiant qui ne lui appartient pas répond 404 (et non 403),
pour ne pas révéler qu'il existe chez un autre client.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import raiseload

from app.besti.fichiers import relayer_fichier
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.besti_projet import BestiCahier, BestiFichier, BestiProjet
from app.models.utilisateur import RoleUtilisateur, Utilisateur
from app.routers.auth import oauth2_scheme
from app.schemas.besti_projet import (
    BestiCahierResponse,
    BestiFichierResponse,
    BestiLienResponse,
    BestiProjetDetail,
    BestiProjetResume,
    BestiStatutResponse,
)

router = APIRouter(prefix="/client/besti", tags=["Espace Client — Projets Besti"])

PROJET_INTROUVABLE = "Projet introuvable"


async def _client_connecte(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Utilisateur:
    """Compte client actif de l'appelant (403 pour tout autre rôle)."""
    payload = decode_access_token(token)
    if payload.get("role") != RoleUtilisateur.CLIENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cette route est réservée aux clients",
        )
    resultat = await db.execute(
        select(Utilisateur).where(Utilisateur.id == int(payload.get("sub")))
    )
    utilisateur = resultat.scalar_one_or_none()
    if utilisateur is None or not utilisateur.actif:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte désactivé")
    return utilisateur


def _resume(projet: BestiProjet) -> dict:
    return {
        "id": projet.besti_projet_id,
        "nom": projet.nom,
        "cree_le": projet.cree_le_besti,
        "echeance_souhaitee": projet.echeance_souhaitee,
        "statut": BestiStatutResponse(
            code=projet.statut_code,
            libelle=projet.statut_libelle,
            depuis=projet.statut_depuis,
        ),
        "maj_le": projet.maj_besti_le,
        "archive_le": projet.archive_le,
        "motif_archivage": projet.motif_archivage,
    }


@router.get("/projets", response_model=list[BestiProjetResume])
async def lister_projets_besti(
    archives: bool = False,
    utilisateur: Utilisateur = Depends(_client_connecte),
    db: AsyncSession = Depends(get_db),
):
    """Projets Besti du client : actifs par défaut, archivés avec `?archives=true`."""
    requete = (
        select(BestiProjet)
        .where(BestiProjet.utilisateur_id == utilisateur.id)
        .options(raiseload("*"))
    )
    if archives:
        requete = requete.where(BestiProjet.archive_le.is_not(None)).order_by(
            BestiProjet.archive_le.desc()
        )
    else:
        requete = requete.where(BestiProjet.archive_le.is_(None)).order_by(
            BestiProjet.maj_besti_le.desc()
        )
    resultat = await db.execute(requete)
    return [BestiProjetResume(**_resume(p)) for p in resultat.scalars().all()]


@router.get("/projets/{projet_id}", response_model=BestiProjetDetail)
async def detail_projet_besti(
    projet_id: UUID,
    utilisateur: Utilisateur = Depends(_client_connecte),
    db: AsyncSession = Depends(get_db),
):
    """Détail d'un projet du client, historique des statuts et cahiers compris."""
    resultat = await db.execute(
        select(BestiProjet).where(
            BestiProjet.besti_projet_id == projet_id,
            BestiProjet.utilisateur_id == utilisateur.id,
        )
    )
    projet = resultat.scalar_one_or_none()
    if projet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROJET_INTROUVABLE)

    return BestiProjetDetail(
        **_resume(projet),
        description=projet.description,
        historique=[
            BestiStatutResponse(code=h.code, libelle=h.libelle, depuis=h.depuis)
            for h in projet.historique
        ],
        cahiers=[
            BestiCahierResponse(
                id=c.besti_cahier_id,
                titre=c.titre,
                description=c.description,
                soumis_le=c.soumis_le,
                statut=(
                    BestiStatutResponse(code=c.statut_code, libelle=c.statut_libelle)
                    if c.statut_code
                    else None
                ),
                fichiers=[
                    BestiFichierResponse(
                        id=f.besti_fichier_id,
                        nom=f.nom,
                        type_mime=f.type_mime,
                        taille_octets=f.taille_octets,
                        ajoute_le=f.ajoute_le,
                    )
                    for f in c.fichiers
                ],
                liens=[
                    BestiLienResponse(
                        id=l.besti_lien_id, url=l.url, libelle=l.libelle, fournisseur=l.fournisseur
                    )
                    for l in c.liens
                ],
            )
            for c in projet.cahiers
        ],
    )


@router.get("/fichiers/{fichier_id}")
async def telecharger_fichier_besti(
    fichier_id: UUID,
    utilisateur: Utilisateur = Depends(_client_connecte),
    db: AsyncSession = Depends(get_db),
):
    """
    Télécharge un fichier d'un projet du client. L'appartenance est vérifiée
    AVANT tout appel à Besti : le fichier d'un autre client répond 404 sans que
    Besti soit interrogé.
    """
    resultat = await db.execute(
        select(BestiFichier)
        .join(BestiCahier, BestiFichier.cahier_id == BestiCahier.id)
        .join(BestiProjet, BestiCahier.projet_id == BestiProjet.id)
        .where(
            BestiFichier.besti_fichier_id == fichier_id,
            BestiProjet.utilisateur_id == utilisateur.id,
        )
        .options(raiseload("*"))
    )
    fichier = resultat.scalar_one_or_none()
    if fichier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable")

    return await relayer_fichier(fichier)
