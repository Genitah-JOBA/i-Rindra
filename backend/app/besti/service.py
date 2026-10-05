# app/besti/service.py
"""
Règles métier de la liaison Besti.

Point d'entrée unique : `appliquer(db, evenement, compte)`. Il est appelé par
le webhook ET par la connexion (quand Besti valide des identifiants), ce qui
garantit qu'un compte Linked arrive à l'identique quel que soit le chemin.

Invariants tenus ici, quels que soient les données reçues :

* **Jamais de fusion par email.** Si l'email est déjà pris par un compte qui
  n'est pas lié au même `besti_id`, on renvoie 409 et le compte existant est
  laissé intact. Rattacher un compte local (direction, DRH, équipe…) à Besti
  par une simple coïncidence d'adresse reviendrait à en donner le contrôle à
  un tiers.
* **Jamais de rôle lu depuis Besti.** Un compte créé est un « client ». Un
  compte existant garde son rôle (même si l'administrateur l'a promu entre-temps côté
  iRindra) : le webhook ne dégrade ni ne réattribue un rôle.
* **Idempotence.** Besti peut renvoyer le même événement plusieurs fois (retry,
  rejeu manuel, double clic). L'upsert se fait sur `besti_id`, jamais sur
  l'email : il n'y a donc jamais de doublon ni d'exception d'unicité.
"""
import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.besti.schemas import BestiUser
from app.models.mot_de_passe_reinit import MotDePasseReinit
from app.models.utilisateur import RoleUtilisateur, Utilisateur
from app.utils.emails import normaliser_email

logger = logging.getLogger("i-rindra.besti")

#: Événements qui créent ou mettent à jour un compte lié.
EVENEMENTS_ACTIVATION = ("user.activated", "user.updated")

#: Rôle attribué à un compte qui n'existe pas encore dans iRindra.
ROLE_COMPTE_BESTI = RoleUtilisateur.CLIENT


async def _par_besti_id(db: AsyncSession, besti_id) -> Utilisateur | None:
    resultat = await db.execute(select(Utilisateur).where(Utilisateur.besti_id == besti_id))
    return resultat.scalar_one_or_none()


async def _par_email(db: AsyncSession, email: str) -> Utilisateur | None:
    resultat = await db.execute(select(Utilisateur).where(Utilisateur.email == email))
    return resultat.scalars().first()


async def _revoquer_jetons_reinitialisation(db: AsyncSession, utilisateur_id: int) -> None:
    """
    Supprime les jetons de réinitialisation en cours d'un utilisateur.

    Les JWT eux-mêmes ne sont pas révocables (l'API est stateless : aucune liste
    de jetons révoqués n'est stockée), mais `get_current_user` refuse un compte
    `actif = False` à chaque requête : la désactivation prend effet immédiatement.
    Purger les jetons de réinitialisation évite surtout qu'un lien déjà envoyé
    reste utilisable après une désactivation.
    """
    from sqlalchemy import delete

    await db.execute(
        delete(MotDePasseReinit).where(MotDePasseReinit.utilisateur_id == utilisateur_id)
    )


async def _desactiver(db: AsyncSession, compte: BestiUser) -> None:
    """Désactive le compte lié et purge ses sessions, qu'il existe ou non."""
    utilisateur = await _par_besti_id(db, compte.bestiId)
    if utilisateur is None:
        # Besti peut notifier une désactivation avant que le webhook
        # d'activation n'ait été traité (ou pour un client jamais venu chez
        # iRindra). Dans ce cas il n'y a rien à désactiver : le retour 204 est
        # exigé par le contrat et l'activation arrivera plus tard.
        logger.info(
            "Désactivation Besti reçue pour un compte inconnu de iRindra : ignorée."
        )
        return

    utilisateur.actif = False
    await _revoquer_jetons_reinitialisation(db, utilisateur.id)
    await db.commit()


async def appliquer(db: AsyncSession, evenement: str, compte: BestiUser) -> Utilisateur | None:
    """
    Applique un événement Besti et retourne l'utilisateur concerné.

    - `user.deactivated` : désactive le compte lié (204 même s'il n'existe pas)
      et retourne `None`.
    - `user.activated` / `user.updated` : crée ou met à jour le compte lié et
      retourne l'utilisateur.
    - autre événement : `HTTPException` 400.
    """
    if evenement == "user.deactivated":
        await _desactiver(db, compte)
        return None

    if evenement not in EVENEMENTS_ACTIVATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Événement inconnu",
        )

    email = normaliser_email(compte.email)

    utilisateur = await _par_besti_id(db, compte.bestiId)
    homonyme = await _par_email(db, email)

    # Conflit d'email : le compte trouvé n'est pas celui de ce client Besti.
    # Le compte existant n'est pas modifié (ni rattaché, ni désactivé).
    if homonyme is not None and homonyme.besti_id != compte.bestiId:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email déjà utilisé par un compte iRindra non lié",
        )

    if utilisateur is None:
        utilisateur = Utilisateur(
            nom=compte.lastName,
            prenom=compte.firstName,
            email=email,
            # Le mot de passe reste dans Besti : rien à hacher ici.
            mot_de_passe_hash=None,
            besti_id=compte.bestiId,
            role=ROLE_COMPTE_BESTI,
            actif=True,
        )
        db.add(utilisateur)
        logger.info(
            "Compte lié Besti créé (id %s) : le rôle client est imposé par iRindra.",
            compte.bestiId,
        )
    else:
        # Un client Besti réactivé redevient actif ; un événement `updated` ne
        # doit pas non plus désactiver un compte qui vient d'être validé.
        utilisateur.nom = compte.lastName
        utilisateur.prenom = compte.firstName
        utilisateur.email = email
        utilisateur.actif = True

    await db.commit()
    await db.refresh(utilisateur)
    return utilisateur