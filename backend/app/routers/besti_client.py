# app/routers/besti_client.py
"""
Projets Besti en CONSULTATION SEULE.

- **client** : ne voit que les projets de SON compte (`utilisateur_id`).
  Un identifiant qui ne lui appartient pas répond 404 (et non 403),
  pour ne pas révéler qu'il existe chez un autre client.
- **gestion (direction, DRH, chef de projet)** : voit TOUS les projets Besti,
  tous clients confondus (suivi / support).
- tout autre rôle (ex. `equipe`) : 403.
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

#: Rôles de gestion (« admin ») : voient tous les projets Besti.
ROLES_ADMIN_BESTI = frozenset(
    {
        RoleUtilisateur.DIRECTION.value,
        RoleUtilisateur.DRH.value,
        RoleUtilisateur.CHEF_DE_PROJET.value,
    }
)

#: Rôles autorisés sur ces routes : gestion + client. Le reste (ex. `equipe`) : 403.
ROLES_AUTORISES_BESTI = ROLES_ADMIN_BESTI | frozenset({RoleUtilisateur.CLIENT.value})


def _est_admin(role: str | None) -> bool:
    """Un rôle de gestion voit tous les projets ; un client ne voit que les siens."""
    return role in ROLES_ADMIN_BESTI


def _valeur_role(role) -> str | None:
    """Valeur chaîne d'un rôle (Enum `RoleUtilisateur` ou str du JWT)."""
    if isinstance(role, RoleUtilisateur):
        return role.value
    return str(role) if role is not None else None


def _est_admin_utilisateur(utilisateur: Utilisateur) -> bool:
    return _est_admin(_valeur_role(utilisateur.role))


async def _utilisateur_autorise(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Utilisateur:
    """Compte actif de l'appelant (client ou gestion). 403 pour tout autre rôle."""
    payload = decode_access_token(token)
    if payload.get("role") not in ROLES_AUTORISES_BESTI:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cette route est réservée aux clients et à la gestion "
            "(direction, DRH, chef de projet)",
        )
    resultat = await db.execute(
        select(Utilisateur).where(Utilisateur.id == int(payload.get("sub")))
    )
    utilisateur = resultat.scalar_one_or_none()
    if utilisateur is None or not utilisateur.actif:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte désactivé")
    # Le rôle en base fait foi (un jeton avec un rôle périmé ne doit ni
    # élargir ni verrouiller à tort) : hors client/gestion → 403.
    if _valeur_role(utilisateur.role) not in ROLES_AUTORISES_BESTI:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cette route est réservée aux clients et à la gestion "
            "(direction, DRH, chef de projet)",
        )
    return utilisateur


# Alias conservé pour compatibilité (anciens imports éventuels).
_client_connecte = _utilisateur_autorise


def _resume(projet: BestiProjet, proprietaire_email: str | None = None) -> dict:
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
        "utilisateur_id": projet.utilisateur_id,
        "proprietaire_email": proprietaire_email,
    }


async def _emails_proprietaires(
    db: AsyncSession, projets: list[BestiProjet]
) -> dict[int, str]:
    """Email du compte propriétaire de chaque projet (uniquement pour l'affichage gestion)."""
    ids = {p.utilisateur_id for p in projets if p.utilisateur_id is not None}
    if not ids:
        return {}
    resultat = await db.execute(
        select(Utilisateur).where(Utilisateur.id.in_(ids)).options(raiseload("*"))
    )
    return {u.id: u.email for u in resultat.scalars().all()}


@router.get("/projets", response_model=list[BestiProjetResume])
async def lister_projets_besti(
    archives: bool = False,
    utilisateur: Utilisateur = Depends(_utilisateur_autorise),
    db: AsyncSession = Depends(get_db),
):
    """Projets Besti : tous pour la gestion, seulement les siens pour un client.

    Actifs par défaut, archivés avec `?archives=true`.
    """
    admin = _est_admin_utilisateur(utilisateur)
    requete = select(BestiProjet).options(raiseload("*"))
    if not admin:
        # Client : cloisonné à son seul compte.
        requete = requete.where(BestiProjet.utilisateur_id == utilisateur.id)
    if archives:
        requete = requete.where(BestiProjet.archive_le.is_not(None)).order_by(
            BestiProjet.archive_le.desc()
        )
    else:
        requete = requete.where(BestiProjet.archive_le.is_(None)).order_by(
            BestiProjet.maj_besti_le.desc()
        )
    resultat = await db.execute(requete)
    projets = list(resultat.scalars().all())
    emails = await _emails_proprietaires(db, projets)
    return [
        BestiProjetResume(**_resume(p, emails.get(p.utilisateur_id))) for p in projets
    ]


@router.get("/projets/{projet_id}", response_model=BestiProjetDetail)
async def detail_projet_besti(
    projet_id: UUID,
    utilisateur: Utilisateur = Depends(_utilisateur_autorise),
    db: AsyncSession = Depends(get_db),
):
    """Détail d'un projet, historique des statuts et cahiers compris.

    La gestion voit n'importe quel projet ; un client ne voit que les siens
    (404 sinon, pour ne pas révéler l'existence du projet d'un autre client).
    """
    admin = _est_admin_utilisateur(utilisateur)
    conditions = [BestiProjet.besti_projet_id == projet_id]
    if not admin:
        conditions.append(BestiProjet.utilisateur_id == utilisateur.id)
    resultat = await db.execute(select(BestiProjet).where(*conditions))
    projet = resultat.scalar_one_or_none()
    if projet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROJET_INTROUVABLE)

    proprietaire_email: str | None = None
    if projet.utilisateur_id is not None:
        r_prop = await db.execute(
            select(Utilisateur).where(Utilisateur.id == projet.utilisateur_id)
        )
        proprietaire = r_prop.scalar_one_or_none()
        proprietaire_email = proprietaire.email if proprietaire else None

    return BestiProjetDetail(
        **_resume(projet, proprietaire_email),
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
    utilisateur: Utilisateur = Depends(_utilisateur_autorise),
    db: AsyncSession = Depends(get_db),
):
    """
    Télécharge un fichier d'un projet Besti. L'appartenance est vérifiée
    AVANT tout appel à Besti : pour un client, le fichier d'un autre client
    répond 404 sans que Besti soit interrogé. La gestion peut télécharger
    le fichier de n'importe quel projet.
    """
    admin = _est_admin_utilisateur(utilisateur)
    conditions = [BestiFichier.besti_fichier_id == fichier_id]
    if not admin:
        conditions.append(BestiProjet.utilisateur_id == utilisateur.id)
    resultat = await db.execute(
        select(BestiFichier)
        .join(BestiCahier, BestiFichier.cahier_id == BestiCahier.id)
        .join(BestiProjet, BestiCahier.projet_id == BestiProjet.id)
        .where(*conditions)
        .options(raiseload("*"))
    )
    fichier = resultat.scalar_one_or_none()
    if fichier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichier introuvable")

    return await relayer_fichier(fichier)
