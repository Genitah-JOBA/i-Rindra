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
* **Une fiche client par compte lié.** Un compte lié sans fiche en reçoit une
  nouvelle (jamais une fiche existante de même nom) ; une fiche déjà
  attribuée n'est jamais modifiée ni remplacée.
"""
import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.besti.schemas import BestiUser
from app.besti.service_projet import archiver_projets_du_compte, desarchiver_projets_du_compte
from app.models.client import Client
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


async def _creer_fiche_client(db: AsyncSession, compte: BestiUser, email: str) -> int:
    """
    Crée la fiche client (entité qui porte les projets) d'un compte Besti et
    retourne son id.

    Toujours une NOUVELLE fiche : rattacher le compte à une fiche existante de
    même nom donnerait à ce client Besti l'accès aux projets d'un autre (deux
    entreprises peuvent porter le même nom), comme une fusion par email.
    """
    nom_complet = f"{compte.firstName} {compte.lastName}".strip()
    fiche = Client(
        nom=(compte.companyName or "").strip() or nom_complet,
        contact=nom_complet,
        email=email,
    )
    db.add(fiche)
    # Le flush attribue l'id sans valider : fiche et compte sont enregistrés
    # par le même commit, ou pas du tout.
    await db.flush()
    logger.info("Fiche client créée pour le compte Besti %s.", compte.bestiId)
    return fiche.id


#: Pays « national » de l'agence : Madagascar (code ISO, ISO-3, indicatif).
CODES_NATIONAUX = {"MG", "MDG", "261", "+261"}
DEVISE_NATIONALE = "Ar"
#: Devise d'un client international dont la fiche était encore en ariary.
DEVISE_INTERNATIONALE = "EUR"


def est_pays_national(code: str | None, nom: str | None) -> bool | None:
    """True / False selon le pays reçu de Besti ; None si Besti n'en dit rien."""
    code = (code or "").strip().upper()
    nom = (nom or "").strip().lower()
    if not code and not nom:
        return None
    return code in CODES_NATIONAUX or "madagascar" in nom


def devise_selon_pays(devise_actuelle: str | None, national: bool | None) -> str | None:
    """
    Devise de la fiche client d'après le pays Besti. Une devise étrangère déjà
    choisie (USD, EUR…) est gardée pour un client international ; seul le
    passage national <-> international la change.
    """
    actuelle = (devise_actuelle or DEVISE_NATIONALE).strip()
    est_ariary = actuelle.upper() in ("AR", "MGA", "ARIARY")
    if national is None:
        return actuelle
    if national:
        return DEVISE_NATIONALE
    return DEVISE_INTERNATIONALE if est_ariary else actuelle


async def _appliquer_pays(db: AsyncSession, client_id: int | None, compte: BestiUser) -> None:
    """Classe la fiche client national / international d'après le pays Besti."""
    national = est_pays_national(compte.countryCode, compte.countryName)
    if client_id is None or national is None:
        return
    fiche = await db.get(Client, client_id)
    if fiche is not None:
        fiche.devise = devise_selon_pays(fiche.devise, national)


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
    # Ses projets Besti sont archivés avec lui (motif « compte désactivé »).
    await archiver_projets_du_compte(db, utilisateur.id)
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
            # Fiche créée AVANT d'ajouter le compte : la contrainte
            # `chk_client_lien` refuse un compte client sans fiche, et le flush
            # de la fiche enregistrerait sinon le compte avec client_id vide.
            client_id=await _creer_fiche_client(db, compte, email),
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
        # Les projets archivés par la désactivation reviennent avec le compte.
        await desarchiver_projets_du_compte(db, utilisateur.id)

    # Sans fiche client, un compte « client » ne voit aucun projet. Une fiche
    # déjà attribuée (ou réattribuée par un administrateur) n'est jamais
    # touchée ; un compte lié créé avant cette règle en reçoit une ici.
    if utilisateur.client_id is None:
        utilisateur.client_id = await _creer_fiche_client(db, compte, email)

    await _appliquer_pays(db, utilisateur.client_id, compte)

    await db.commit()
    await db.refresh(utilisateur)
    return utilisateur
