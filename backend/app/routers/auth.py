# auth.py

import time
import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.client import Client
from app.models.mot_de_passe_reinit import MotDePasseReinit
from app.utils.jetons_reinit import generer_jeton_reinit, hacher_jeton_reinit, jeton_correspondant
from app.utils.mots_de_passe import verifier_mot_de_passe
from app.utils.emails import normaliser_email
from app.utils.email import envoyer_email_reinitialisation, smtp_configure
from app.besti.client import verifier_identifiants as besti_verifier_identifiants
from app.besti.service import appliquer as besti_appliquer
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("i-rindra.auth")

#: Page Besti qui gère le mot de passe des clients approuvés. Les comptes
#: clients y sont créés par Besti : iRindra ne détient pas leur mot de passe
#: et ne peut donc ni l'envoyer ni le changer.
URL_MOT_DE_PASSE_BESTI = "https://besti.bef4prod.com/users/forgot-password"

# --- Rate limiting simple en mémoire ---
_rate_limits: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # secondes
RATE_LIMIT_MAX = 10     # requêtes max par fenêtre

def _check_rate_limit(key: str):
    now = time.time()
    _rate_limits[key] = [t for t in _rate_limits[key] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limits[key]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de requêtes. Réessayez dans quelques secondes.",
        )
    _rate_limits[key].append(now)


def _adresse_client(request: Request) -> str:
    """
    Adresse IP de l'appelant, pour le rate limiting.

    `request.client.host` suffit en local et derrière un reverse proxy fidèle.
    Si un proxy est intercalé, c'est le premier en-tête `X-Forwarded-For` qui
    fait foi — ce qui n'est pas fiable dès lors que n'importe qui peut le
    forger. C'est un compromis assumé : le rate limiting est une barrière
    incidente (on veut décourager le bruit), pas une garantie d'intégrité.
    Aucune donnée sensible n'est indexée par cette valeur.
    """
    direct = request.client.host if request.client else "inconnu"
    if direct not in ("127.0.0.1", "::1", "testclient"):
        return direct
    return request.headers.get("x-forwarded-for", direct).split(",")[0].strip() or direct

# On crée un routeur pour regrouper toutes les routes d'authentification
router = APIRouter(prefix="/auth", tags=["Authentification"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Validation d'entréet sortie

class LoginRequest(BaseModel):
    email: EmailStr
    mot_de_passe: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    nom: str
    prenom: str
    role: str

class UserResponse(BaseModel):
    id: int
    email: str
    nom: str
    prenom: str
    role: str
    actif: bool
    client_id: Optional[int] = None

# Endpoint

def _reponse_token(user: Utilisateur) -> TokenResponse:
    """Construit la réponse de connexion (jeton + identity), identique pour
    un compte local et pour un compte lié à Besti : le frontend ne change pas."""
    token_data = {
        "sub": str(user.id),
        "role": user.role.value,
        "email": user.email,
        "client_id": user.client_id,
    }
    access_token = create_access_token(token_data)

    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        nom=user.nom,
        prenom=user.prenom,
        role=user.role.value,
    )


async def _connexion_locale(user: Utilisateur, mot_de_passe: str) -> TokenResponse:
    """Connexion d'un compte iRindra classique : vérification locale, inchangée.

    Ce chemin est celui de tous les comptes créés dans iRindra (inscription,
    création par un administrateur). Besti n'est pas interrogé : ces comptes
    restent totalement indépendants.
    """
    # Vérifie que le mot de passe est correct. `verify_password` renvoie False
    # si le hash est absent, sans lever : pas d'exception sur un compte lié qui
    # n'aurait pas de hash local.
    if not verify_password(mot_de_passe, user.mot_de_passe_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé"
        )

    return _reponse_token(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),  # <- Format standard OAuth2
    db: AsyncSession = Depends(get_db)
):
    """
    Authentifie un utilisateur par email/mot de passe.
    Retourne un token JWT si les identifiants sont corrects.
    
    OAuth2PasswordRequestForm attend les champs :
       - username (on utilisera l'email ici)
       - password

    Deux chemins, jamais mélangés :

    - **compte local** (`besti_id` vide) : tout se passe dans iRindra, comme
      avant la liaison Besti. Inchangé.
    - **compte lié Besti, ou email inconnu** : Besti vérifie le mot de passe,
      car il détient celui des clients qu'il a approuvés. iRindra se contente
      d'émettre son propre JWT.
    """
    _check_rate_limit(f"login:{form_data.username}")

    # 1. Recherche d'utilisateur par email (forme canonique : minuscules)
    email = normaliser_email(form_data.username)
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.email == email)
    )
    user = result.scalar_one_or_none()

    # 2. Compte LOCAL : son mot de passe est vérifié ici, Besti n'est pas appelé.
    if user is not None and user.besti_id is None:
        return await _connexion_locale(user, form_data.password)

    # 3. Compte lié à Besti, ou email inconnu : Besti est seul juge.
    #
    # Sans clé API, la liaison est inactive : on renvoie la même erreur qu'un
    # mot de passe faux, pour ne pas révéler quels emails sont des comptes
    # Besti. Les comptes locaux ci-dessus restent connectés normalement.
    if not settings.BESTI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Un compte lié désactivé ne peut plus se connecter, même si Besti valide
    # encore le mot de passe : la désactivation a été décidée ici.
    if user is not None and not user.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé"
        )

    # Besti lève 401 / 403 / 429 / 503 selon sa réponse : on laisse ces codes
    # remonter tels quels.
    compte = await besti_verifier_identifiants(email, form_data.password)

    # Si le webhook n'est jamais arrivé (client approuvé avant la liaison, envoi
    # perdu), le compte n'existe peut-être pas encore : on le crée au passage,
    # par le même chemin que le webhook, avec le rôle client.
    user = await besti_appliquer(db, "user.activated", compte)

    if not user.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé"
        )

    return _reponse_token(user)

@router.get("/me", response_model=UserResponse)
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    """
    Retourne les informations de l'utilisateur connecté à partir du token JWT.
    """
    # 1. Décode le token pour récupérer l'ID utilisateur
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    
    # 2. Récupère l'utilisateur en BD
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    if not user.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé"
        )
    
    return UserResponse(
        id=user.id,
        email=user.email,
        nom=user.nom,
        prenom=user.prenom,
        role=user.role.value,
        actif=user.actif,
        client_id=user.client_id,
    )

class UpdateMeRequest(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[EmailStr] = None
    # Changement de mot de passe (optionnel) : les deux champs requis ensemble
    mot_de_passe_actuel: Optional[str] = None
    nouveau_mot_de_passe: Optional[str] = None


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UpdateMeRequest,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Met à jour les informations du **compte connecté** (nom, prénom, email,
    et éventuellement le mot de passe). Chaque utilisateur ne modifie que lui-même.
    """
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))

    result = await db.execute(select(Utilisateur).where(Utilisateur.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur non trouvé")

    if user.besti_id is not None:
        # Un client Besti n'a pas de mot de passe ici : le changer localement
        # n'aurait aucun effet (Besti refuserait le nouveau), et modifier son
        # email le rendrait introuvable à la prochaine connexion, Besti
        # ne connaissant que l'adresse qu'il a approuvée. On renvoie vers Besti.
        if data.nouveau_mot_de_passe or (
            data.email and normaliser_email(data.email) != user.email
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Votre compte est géré par Besti : modifiez votre mot de passe "
                    f"ou votre adresse email sur {URL_MOT_DE_PASSE_BESTI}."
                ),
            )

    # Email : vérifier l'unicité si modifié
    if data.email and normaliser_email(data.email) != user.email:
        nouvel_email = normaliser_email(data.email)
        r = await db.execute(select(Utilisateur).where(Utilisateur.email == nouvel_email))
        if r.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Cet email est déjà utilisé"
            )
        user.email = nouvel_email

    if data.nom:
        user.nom = data.nom
    if data.prenom:
        user.prenom = data.prenom

    # Changement de mot de passe : vérifier l'ancien
    if data.nouveau_mot_de_passe:
        if not data.mot_de_passe_actuel or not verify_password(
            data.mot_de_passe_actuel, user.mot_de_passe_hash
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le mot de passe actuel est incorrect.",
            )
        erreur = verifier_mot_de_passe(data.nouveau_mot_de_passe)
        if erreur:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=erreur)
        user.mot_de_passe_hash = hash_password(data.nouveau_mot_de_passe)

    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        nom=user.nom,
        prenom=user.prenom,
        role=user.role.value,
        actif=user.actif,
        client_id=user.client_id,
    )


@router.post("/logout")
async def logout():
    """
    Déconnexion côté client :
    Le token est invalidé côté frontend (on le supprime du localStorage).
    Ici, on ne fait rien car l'API est stateless (JWT).
    """
    return {"message": "Déconnexion réussie"}


# -Réinitialisation du mot de passe
#
# Le flux volontairement ne révèle JAMAIS si une adresse email est enregistrée :
# `/mot-de-passe-oublie` répond toujours 200 avec le même message. Sans cela, un
# attaquant pourrait lister les comptes de la plateforme. Les erreurs de jeton
# renvoient 400 (et non 401) parce que l'intercepteur axios du frontend redirige
# vers /login sur tout 401 — ce qui ejecterait l'utilisateur en plein formulaire.

MESSAGE_REINIT_GENERIQUE = (
    "Si un compte est associé à cette adresse email, un lien de réinitialisation "
    "vient d'être envoyé. Vérifiez votre boîte de réception et vosCourriers indésirables."
)


class MotDePasseOublieRequest(BaseModel):
    email: EmailStr


class MotDePasseOublieResponse(BaseModel):
    message: str
    # Renseigné uniquement en développement (jamais en production) pour
    # permettre de tester le flux sans serveur mail.
    lien_reinitialisation: Optional[str] = None


class ReinitialiserMdpRequest(BaseModel):
    token: str
    nouveau_mot_de_passe: str


class ReinitialiserMdpResponse(BaseModel):
    message: str


class VerifierJetonResponse(BaseModel):
    valide: bool
    # Masquage du type de compte, ex: "i-R••••@domaine.com" — jamais l'adresse
    # complète, pour qu'un jeton valide ne devienne pas une fuite d'information.
    email_masque: Optional[str] = None


def _masquer_email(email: str) -> str:
    """« prenom@domaine.fr » -> « p••••@domaine.fr »"""
    local, _, domaine = email.partition("@")
    if not domaine:
        return "••••"
    return f"{local[:1]}••••@{domaine}"


async def _rechercher_jeton_valide(db: AsyncSession, token_en_clair: str) -> Optional[MotDePasseReinit]:
    """
    Retourne la ligne de jeton correspondant au token fourni, si elle existe,
    n'a pas déjà été utilisée et n'est pas expirée. None sinon.
    """
    if not token_en_clair or len(token_en_clair) > 128:
        return None

    empreinte = hacher_jeton_reinit(token_en_clair)
    resultat = await db.execute(
        select(MotDePasseReinit).where(
            MotDePasseReinit.token_hash == empreinte,
            MotDePasseReinit.utilise_a.is_(None),
        )
    )
    ligne = resultat.scalar_one_or_none()
    if ligne is None or ligne.est_expire:
        return None
    return ligne


@router.post("/mot-de-passe-oublie", response_model=MotDePasseOublieResponse)
async def mot_de_passe_oublie(
    data: MotDePasseOublieRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Étape 1 : demande un lien de réinitialisation.

    Répond 200 dans tous les cas, avec le même message pour une adresse
    inconnue, désactivée ou locale (anti-énumération de comptes).

    Cas particulier : un compte *lié à Besti* ne peut pas être réinitialisé
    ici — Besti détient le mot de passe. La réponse renvoie alors vers la page
    Besti, ce qui est le comportement attendu par l'utilisateur sur ce cas.
    """
    _check_rate_limit(f"reinit:oublie:{normaliser_email(data.email)}")

    email = normaliser_email(data.email)
    resultat = await db.execute(select(Utilisateur).where(Utilisateur.email == email))
    user = resultat.scalar_one_or_none()

    # Utilisateur inconnu ou compte désactivé : on répond normalement, sans rien
    # faire. La seule trace laissée est un log serveur.
    if user is None or not user.actif:
        logger.info("Demande de réinitialisation pour une adresse non utilisable.")
        return MotDePasseOublieResponse(message=MESSAGE_REINIT_GENERIQUE)

    # Compte client géré par Besti : aucun jeton local n'est créé (il ne
    # servirait à rien, aucun hash n'existe ici). Le message renvoie vers Besti,
    # seule autorité qui puisse changer ce mot de passe.
    if user.besti_id is not None:
        logger.info(
            "Demande de réinitialisation sur un compte lié à Besti : ignorée."
        )
        return MotDePasseOublieResponse(
            message=(
                "Votre compte est géré par Besti : demandez la réinitialisation "
                f"sur {URL_MOT_DE_PASSE_BESTI}."
            )
        )

    # Invalide les demandes précédentes : seul le dernier lien mailed reste
    # valable, ce qui évite que plusieurs liens circulent en parallèle.
    await db.execute(
        delete(MotDePasseReinit).where(MotDePasseReinit.utilisateur_id == user.id)
    )

    jeton, empreinte = generer_jeton_reinit()
    expire_a = datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)

    db.add(
        MotDePasseReinit(
            utilisateur_id=user.id,
            token_hash=empreinte,
            expire_a=expire_a,
        )
    )
    await db.commit()

    envoye = await envoyer_email_reinitialisation(user.email, user.prenom, jeton)

    # En développement, on renvoie le lien pour tester le flux sans SMTP.
    if settings.RESET_LIEN_EN_REPONSE:
        from app.utils.email import lien_reinitialisation

        return MotDePasseOublieResponse(
            message=MESSAGE_REINIT_GENERIQUE,
            lien_reinitialisation=lien_reinitialisation(jeton),
        )

    if not envoye:
        logger.error(
            "Email de réinitialisation non envoyé (SMTP configuré : %s).",
            smtp_configure(),
        )

    return MotDePasseOublieResponse(message=MESSAGE_REINIT_GENERIQUE)


@router.get("/verifier-jeton-reinit", response_model=VerifierJetonResponse)
async def verifier_jeton_reinit(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Vérifie qu'un lien est encore valable, pour afficher le formulaire ou une
    erreur explicite dès l'ouverture de la page.
    """
    ligne = await _rechercher_jeton_valide(db, token)
    if ligne is None:
        return VerifierJetonResponse(valide=False)

    resultat = await db.execute(
        select(Utilisateur).where(Utilisateur.id == ligne.utilisateur_id)
    )
    user = resultat.scalar_one_or_none()
    if user is None or not user.actif:
        return VerifierJetonResponse(valide=False)

    return VerifierJetonResponse(valide=True, email_masque=_masquer_email(user.email))


@router.post("/reinitialiser-mdp", response_model=ReinitialiserMdpResponse)
async def reinitialiser_mdp(
    data: ReinitialiserMdpRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Étape 2 : applique le nouveau mot de passe.

    Le jeton est à usage unique : il est marqué comme utilisé et l'ancien mot
    de passe cesse immédiatement de fonctionner.
    """
    # Deux garde-fous distincts, car ils protègent contre deux menaces
    # différentes. L'IP bride le flot (une IP ne peut pas marteler le service) ;
    # le jeton bride la devinette du lien (une IP ne peut pas bloquer le service).
    _check_rate_limit(f"reinit:appliquer:ip:{_adresse_client(request)}")

    erreur = verifier_mot_de_passe(data.nouveau_mot_de_passe)
    if erreur:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=erreur)

    ligne = await _rechercher_jeton_valide(db, data.token)
    if ligne is None:
        # 400 et non 401 : voir le commentaire d'en-tête de section.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.",
        )

    # Rate limit PAR JETON, et non global : avec une clé unique, dix tentatives
    # de la part d'un seul attaquant suffisaient à bloquer l'application du
    # nouveau mot de passe pour tous les autres utilisateurs pendant une minute.
    _check_rate_limit(f"reinit:appliquer:jeton:{ligne.token_hash}")

    resultat = await db.execute(
        select(Utilisateur).where(Utilisateur.id == ligne.utilisateur_id)
    )
    user = resultat.scalar_one_or_none()
    if user is None or not user.actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce lien de réinitialisation n'est plus utilisable.",
        )

    user.mot_de_passe_hash = hash_password(data.nouveau_mot_de_passe)

    # Usage unique : le lien est consommé, et tous les autres jetons de cet
    # utilisateur sont purgés au passage.
    ligne.utilise_a = datetime.now(timezone.utc)
    await db.execute(
        delete(MotDePasseReinit).where(
            MotDePasseReinit.utilisateur_id == user.id,
            MotDePasseReinit.id != ligne.id,
        )
    )

    await db.commit()

    logger.info("Mot de passe réinitialisé pour l'utilisateur %s", user.id)

    return ReinitialiserMdpResponse(
        message="Mot de passe mis à jour. Vous pouvez vous connecter avec votre nouveau mot de passe."
    )


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    """
    Dépendance réutilisable pour récupérer l'ID de l'utilisateur connecté.
    À utiliser dans les autres routes.
    """
    payload = decode_access_token(token)
    return int(payload.get("sub"))

async def get_current_user_role(token: str = Depends(oauth2_scheme)) -> str:
    """
    Dépendance réutilisable pour récupérer le rôle de l'utilisateur connecté.
    """
    payload = decode_access_token(token)
    return payload.get("role")

# -Inscription
class RegisterRequest(BaseModel):
    email: EmailStr
    mot_de_passe: str
    nom: str
    prenom: str
    role: Optional[str] = "equipe"
    client_id: Optional[int] = None   # obligatoire UNIQUEMENT si role = "client"

class RegisterResponse(BaseModel):
    id: int
    email: str
    nom: str
    prenom: str
    role: str
    message: str

# ENDPOINT D'INSCRIPTION
@router.post("/register", response_model=RegisterResponse)
async def register(
    user_data: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Crée un nouvel utilisateur.
    Le mot de passe est hashé automatiquement.
    
    L'inscription publique est réservée aux rôles 'equipe' et 'client' —
    les comptes 'direction'/'drh'/'chef_de_projet' doivent être créés par la direction.
    """
    _check_rate_limit(f"register:{normaliser_email(user_data.email)}")

    # L'email est stocké et recherché sous forme canonique : c'est ce qui permet
    # à « mot de passe oublié » de retrouver n'importe quel compte, quelle que
    # soit la casse saisie à l'inscription.
    email = normaliser_email(user_data.email)

    # 1. Vérifie que l'email n'est pas déjà utilisé
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.email == email)
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet email est déjà utilisé"
        )

    # 1.bis Applique la politique de mot de passe commune
    erreur_mdp = verifier_mot_de_passe(user_data.mot_de_passe)
    if erreur_mdp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=erreur_mdp,
        )
    
    # 2. Valide le rôle
    try:
        role_enum = RoleUtilisateur(user_data.role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rôle invalide. Choisir parmi : {[r.value for r in RoleUtilisateur]}"
        )

    # 2.bis Empêche l'escalade de privilèges via auto-inscription
    if role_enum in (RoleUtilisateur.DIRECTION, RoleUtilisateur.DRH, RoleUtilisateur.CHEF_DE_PROJET):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Les comptes 'direction', 'drh' et 'chef_de_projet' ne peuvent pas être créés par inscription publique"
        )

    # 3. Règle métier (CDC) : cohérence rôle / client_id
    #    - un compte 'client' DOIT être rattaché à un client existant
    #    - un compte interne (direction/drh/chef_de_projet/equipe) n'est rattaché à aucun client
    if role_enum == RoleUtilisateur.CLIENT:
        if user_data.client_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un compte 'client' doit être rattaché à un client (client_id requis)."
            )
        result = await db.execute(
            select(Client).where(Client.id == user_data.client_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Le client id={user_data.client_id} n'existe pas."
            )
        client_id_final = user_data.client_id
    else:
        client_id_final = None   # imposé par la contrainte chk_client_lien

    # 4. Crée le nouvel utilisateur
    new_user = Utilisateur(
        email=email,
        mot_de_passe_hash=hash_password(user_data.mot_de_passe),
        nom=user_data.nom,
        prenom=user_data.prenom,
        role=role_enum,
        actif=True,
        client_id=client_id_final,
    )
    
    # 5. Sauvegarde en base de données
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return RegisterResponse(
        id=new_user.id,
        email=new_user.email,
        nom=new_user.nom,
        prenom=new_user.prenom,
        role=new_user.role.value,
        message="Utilisateur créé avec succès"
    )