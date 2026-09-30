# tests/test_reinitialisation_mdp.py
"""
Tests du flux de réinitialisation de mot de passe.

Deux niveaux :
  1. Unités pures : génération/empreinte des jetons, politique de mot de passe,
     masquage d'email.
  2. Endpoints FastAPI avec une session SQLAlchemy bouchonnée (`FauxSession`) :
     on vérifie notamment l'anti-énumération de comptes et l'usage unique du jeton,
     deux propriétés de sécurité qu'un simple test « ça marche » ne couvre pas.
"""
import re
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import hash_password, verify_password
from app.models.mot_de_passe_reinit import MotDePasseReinit
from app.models.utilisateur import RoleUtilisateur, Utilisateur
from app.routers import auth
from app.utils.jetons_reinit import (
    generer_jeton_reinit,
    hacher_jeton_reinit,
    jeton_correspondant,
)
from app.utils.mots_de_passe import LONGUEUR_MAX, verifier_mot_de_passe
from app.utils.emails import email_valide, normaliser_email


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _faire_utilisateur(email="alice@exemple.fr", actif=True):
    return Utilisateur(
        id=1,
        nom="Dupont",
        prenom="Alice",
        email=email,
        mot_de_passe_hash=hash_password("Ancien1Mot"),
        role=RoleUtilisateur.EQUIPE,
        actif=actif,
        client_id=None,
    )


def _faire_jeton(utilisateur_id=1, expire_dans=1):
    jeton_clair, empreinte = generer_jeton_reinit()
    ligne = MotDePasseReinit(
        utilisateur_id=utilisateur_id,
        token_hash=empreinte,
        expire_a=datetime.now(timezone.utc) + timedelta(hours=expire_dans),
    )
    ligne.id = 1
    return jeton_clair, ligne


class ResultatFaux:
    def __init__(self, valeur):
        self._valeur = valeur

    def scalar_one_or_none(self):
        return self._valeur

    def scalars(self):
        return self


class FauxSession:
    """
    Remplace AsyncSession. `execute` inspecte le SQL et les paramètres liés pour
    répondre sans base : suffisant pour couvrir les requêtes du flux.
    """

    def __init__(self, user=None, jetons=None):
        self.user = user
        self.jetons = list(jetons or [])
        self.en_attente = []
        self.crees = []
        self.commits = 0

    def _valeurs(self, requete):
        return dict(requete.compile().params)

    async def execute(self, requete):
        sql = str(requete)
        params = self._valeurs(requete)

        # --- lecture d'un jeton par empreinte
        if "FROM mot_de_passe_reinit" in sql:
            empreinte = next(
                (v for k, v in params.items() if k.startswith("token_hash")), None
            )
            for jeton in self.jetons:
                if jeton.token_hash == empreinte and jeton.utilise_a is None:
                    return ResultatFaux(jeton)
            return ResultatFaux(None)

        # --- purge des jetons
        if "DELETE FROM mot_de_passe_reinit" in sql:
            utilisateur_id = next(
                (v for k, v in params.items() if k.startswith("utilisateur_id")), None
            )
            id_exclu = next((v for k, v in params.items() if k.startswith("id_1")), None)
            # SQLAlchemy nome le paramètre d'une comparaison `colonne != valeur`
            # d'après la colonne visée : `id_1` correspond ici à `id != ligne.id`.
            self.jetons = [
                j
                for j in self.jetons
                if not (j.utilisateur_id == utilisateur_id and j.id != id_exclu)
            ]
            return ResultatFaux(None)

        # --- lecture de l'utilisateur
        if "FROM utilisateur" in sql:
            # Le email est-il utilisé comme critère de recherche ? Si oui on
            # respecte l'égalité exacte : c'est ce qui permet de vérifier que
            # les endpoints normalisent bien la casse avant d'interroger la base.
            if "utilisateur.email" in sql:
                email_recherche = next(
                    (v for k, v in params.items() if k.startswith("email")), None
                )
                # `None` = recherche par id, pas par email : on laisse passer.
                if (
                    email_recherche is not None
                    and self.user is not None
                    and email_recherche != self.user.email
                ):
                    return ResultatFaux(None)
            return ResultatFaux(self.user)

        return ResultatFaux(None)

    def add(self, objet):
        objet.id = len(self.jetons) + 1
        self.en_attente.append(objet)

    async def commit(self):
        self.commits += 1
        for objet in self.en_attente:
            if objet not in self.jetons:
                self.jetons.append(objet)
            if isinstance(objet, Utilisateur):
                self.crees.append(objet)
        self.en_attente = []

    async def refresh(self, objet):
        pass


def _client(session):
    """Client HTTP sur l'app, avec get_db bouchonné sur `session`."""
    from app.main import app

    async def _get_db():
        return session

    app.dependency_overrides[auth.get_db] = _get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# --- 1. Jeton --------------------------------------------------------------


def test_jeton_est_opaque_et_non_reversible():
    jeton, empreinte = generer_jeton_reinit()
    assert len(jeton) >= 32
    assert not re.fullmatch(r"[0-9]+", jeton), "le jeton ne doit pas être un nombre"
    assert len(empreinte) == 64
    assert hacher_jeton_reinit(jeton) == empreinte


def test_jetons_sont_differents_a_chaque_appel():
    assert generer_jeton_reinit()[0] != generer_jeton_reinit()[0]


def test_jeton_correspondant_refuse_une_variante():
    jeton, empreinte = generer_jeton_reinit()
    assert jeton_correspondant(jeton, empreinte)
    assert not jeton_correspondant(jeton + "x", empreinte)
    assert not jeton_correspondant("", empreinte)
    assert not jeton_correspondant(jeton.upper(), empreinte)


# --- 2. Politique de mot de passe ------------------------------------------


def test_mot_de_passe_valide():
    assert verifier_mot_de_passe("Rindra2026") is None


@pytest.mark.parametrize(
    "mot_de_passe, fragment_attendu",
    [
        ("Ab1", "au moins 8"),  # trop court
        ("rindra2026", "majuscule"),  # pas de majuscule
        ("Rindraaaaa", "chiffre"),  # pas de chiffre
        ("A" * (LONGUEUR_MAX + 1), "dépasser"),
    ],
)
def test_mot_de_passe_refuse(mot_de_passe, fragment_attendu):
    erreur = verifier_mot_de_passe(mot_de_passe)
    assert erreur is not None
    assert fragment_attendu in erreur


# --- 3. Masquage d'email ---------------------------------------------------


def test_masquer_email_ne_divulgue_pas_la_partie_locale():
    masque = auth._masquer_email("alice.dupont@exemple.fr")
    assert "alice.dupont" not in masque
    assert masque.endswith("@exemple.fr")
    assert masque.startswith("a")


def test_masquer_email_sans_domaine():
    assert auth._masquer_email("alice") == "••••"


# --- 4. Anti-énumération de comptes ----------------------------------------


@pytest.mark.anyio
async def test_demande_repond_identiquement_que_le_compte_existe_ou_non():
    """
    /mot-de-passe-oublie doit répondre exactement pareil pour une adresse
    inconnue et pour une adresse existante, sinon l'endpoint devient un
    annuaire permettant d'énumérer les comptes de la plateforme.
    """
    session_inconnu = FauxSession(user=None)
    async with _client(session_inconnu) as c:
        r_inconnu = await c.post(
            "/auth/mot-de-passe-oublie", json={"email": "inconnu@exemple.fr"}
        )

    session_connu = FauxSession(user=_faire_utilisateur())
    async with _client(session_connu) as c:
        r_connu = await c.post(
            "/auth/mot-de-passe-oublie", json={"email": "alice@exemple.fr"}
        )

    assert r_inconnu.status_code == r_connu.status_code == 200
    assert r_inconnu.json()["message"] == r_connu.json()["message"]

    # Aucun jeton pour une adresse inconnue, un jeton pour une adresse connue.
    assert session_inconnu.jetons == []
    assert len(session_connu.jetons) == 1


@pytest.mark.anyio
async def test_seule_lempreinte_du_jeton_est_persistee():
    session = FauxSession(user=_faire_utilisateur())
    async with _client(session) as c:
        await c.post("/auth/mot-de-passe-oublie", json={"email": "alice@exemple.fr"})

    stocke = session.jetons[0]
    assert re.fullmatch(r"[0-9a-f]{64}", stocke.token_hash)
    assert stocke.utilise_a is None


@pytest.mark.anyio
async def test_compte_desactive_ne_recoit_rien():
    session = FauxSession(user=_faire_utilisateur(actif=False))
    async with _client(session) as c:
        r = await c.post("/auth/mot-de-passe-oublie", json={"email": "alice@exemple.fr"})

    assert r.status_code == 200
    assert session.jetons == []


# --- 5. Réinitialisation ---------------------------------------------------


@pytest.mark.anyio
async def test_reinitialisation_change_le_mot_de_passe():
    user = _faire_utilisateur()
    jeton_clair, ligne = _faire_jeton()
    session = FauxSession(user=user, jetons=[ligne])

    async with _client(session) as c:
        r = await c.post(
            "/auth/reinitialiser-mdp",
            json={"token": jeton_clair, "nouveau_mot_de_passe": "Nouveau7Mdp"},
        )

    assert r.status_code == 200
    assert verify_password("Nouveau7Mdp", user.mot_de_passe_hash)
    assert not verify_password("Ancien1Mot", user.mot_de_passe_hash)
    assert ligne.utilise_a is not None


@pytest.mark.anyio
async def test_jeton_est_a_usage_unique():
    user = _faire_utilisateur()
    jeton_clair, ligne = _faire_jeton()
    session = FauxSession(user=user, jetons=[ligne])

    async with _client(session) as c:
        await c.post(
            "/auth/reinitialiser-mdp",
            json={"token": jeton_clair, "nouveau_mot_de_passe": "Nouveau7Mdp"},
        )
        r2 = await c.post(
            "/auth/reinitialiser-mdp",
            json={"token": jeton_clair, "nouveau_mot_de_passe": "Autre8Mdp"},
        )

    assert r2.status_code == 400
    # Le second essai n'a rien changé.
    assert not verify_password("Autre8Mdp", user.mot_de_passe_hash)


@pytest.mark.anyio
async def test_jeton_expire_refuse():
    user = _faire_utilisateur()
    jeton_clair, ligne = _faire_jeton(expire_dans=-1)
    session = FauxSession(user=user, jetons=[ligne])

    async with _client(session) as c:
        r = await c.post(
            "/auth/reinitialiser-mdp",
            json={"token": jeton_clair, "nouveau_mot_de_passe": "Nouveau7Mdp"},
        )

    assert r.status_code == 400
    assert verify_password("Ancien1Mot", user.mot_de_passe_hash)


@pytest.mark.anyio
async def test_jeton_inconnu_renvoie_400_pas_401():
    """
    L'intercepteur axios du frontend redirige vers /login sur tout 401. Un jeton
    invalide doit donc répondre 400 pour ne pas éjecter l'utilisateur du
    formulaire de réinitialisation.
    """
    session = FauxSession(user=_faire_utilisateur())

    async with _client(session) as c:
        r = await c.post(
            "/auth/reinitialiser-mdp",
            json={"token": "jeton-inconnu", "nouveau_mot_de_passe": "Nouveau7Mdp"},
        )
        verif = await c.get("/auth/verifier-jeton-reinit?token=jeton-inconnu")

    assert r.status_code == 400
    assert verif.status_code == 200
    assert verif.json() == {"valide": False, "email_masque": None}


@pytest.mark.anyio
async def test_mot_de_passe_faible_refuse():
    session = FauxSession(user=None)

    async with _client(session) as c:
        r = await c.post(
            "/auth/reinitialiser-mdp",
            json={"token": "jeton-inexistant", "nouveau_mot_de_passe": "MotDePasseSansChiffre"},
        )

    assert r.status_code == 400
    assert "chiffre" in r.json()["detail"]


@pytest.mark.anyio
async def test_verifier_jeton_masque_ladresse():
    user = _faire_utilisateur()
    jeton_clair, ligne = _faire_jeton()
    session = FauxSession(user=user, jetons=[ligne])

    async with _client(session) as c:
        r = await c.get(f"/auth/verifier-jeton-reinit?token={jeton_clair}")

    assert r.json()["valide"] is True
    assert "alice@exemple.fr" not in r.json()["email_masque"]


# --- 6. Normalisation des emails (régression) -------------------------------
#
# Régression : `/mot-de-passe-oublie` normalisait l'adresse alors que login et
# register ne le faisaient pas. Un compte créé avec « Jean.Dupont@Domaine.fr »
# pouvait se connecter mais ne recevait jamais son lien de réinitialisation —
# alors que la page affichait « un lien vient d'être envoyé ».


def test_normaliser_email_canonise_la_casse_et_les_espaces():
    assert normaliser_email("  Jean.Dupont@Domaine.FR  ") == "jean.dupont@domaine.fr"
    assert normaliser_email("ALICE@EXEMPLE.FR") == "alice@exemple.fr"
    assert normaliser_email("alice@exemple.fr") == "alice@exemple.fr"
    assert normaliser_email("") == ""
    assert normaliser_email(None) == ""


@pytest.mark.parametrize(
    "adresse, attendu",
    [
        ("alice@exemple.fr", True),
        ("alice@exemple", False),
        ("alice", False),
        ("a b@exemple.fr", False),
        ("alice@@exemple.fr", False),
        ("x" * 250 + "@exemple.fr", False),  # au-delà de LONGUEUR_MAX
    ],
)
def test_email_valide(adresse, attendu):
    assert email_valide(adresse) is attendu


@pytest.mark.anyio
async def test_oublie_retrouve_un_compte_saisi_en_majuscules():
    """Le cas qui cassait : l'email stocké en minuscules doit être retrouvé
    même si l'utilisateur tape une autre casse dans le formulaire."""
    session = FauxSession(user=_faire_utilisateur(email="alice@exemple.fr"))

    async with _client(session) as c:
        r = await c.post(
            "/auth/mot-de-passe-oublie", json={"email": "  Alice@Exemple.FR "}
        )

    assert r.status_code == 200
    assert len(session.jetons) == 1, "le lien aurait dû être envoyé"


@pytest.mark.anyio
async def test_oublie_echoue_sil_trouve_personne():
    """Contrôle négatif : la normalisation ne doit pas élargir la recherche au
    point de transformer une adresse inconnue en adresse existante."""
    session = FauxSession(user=_faire_utilisateur(email="alice@exemple.fr"))

    async with _client(session) as c:
        r = await c.post(
            "/auth/mot-de-passe-oublie", json={"email": "bob@exemple.fr"}
        )

    assert r.status_code == 200
    assert session.jetons == []


@pytest.mark.anyio
async def test_login_accepte_la_casse_saisie():
    session = FauxSession(user=_faire_utilisateur(email="alice@exemple.fr"))

    async with _client(session) as c:
        r = await c.post(
            "/auth/login",
            data={"username": "ALICE@Exemple.fr", "password": "Ancien1Mot"},
        )

    assert r.status_code == 200
    assert r.json()["user_id"] == 1


@pytest.mark.anyio
async def test_register_stocke_lemail_en_minuscules():
    session = FauxSession(user=None)

    async with _client(session) as c:
        r = await c.post(
            "/auth/register",
            json={
                "email": "Nouvelle.Utilisatrice@Domaine.FR",
                "mot_de_passe": "Rindra2026",
                "nom": "Martin",
                "prenom": "Nina",
                "role": "equipe",
            },
        )

    assert r.status_code == 200
    assert r.json()["email"] == "nouvelle.utilisatrice@domaine.fr"
    # L'objet réellement persisté porte aussi la forme canonique.
    assert session.crees[0].email == "nouvelle.utilisatrice@domaine.fr"


# --- 7. Rate limiting -------------------------------------------------------


@pytest.mark.anyio
async def test_une_adresse_ip_ne_bloque_pas_le_lien_des_autres():
    """
    Régression : le rate limit de /reinitialiser-mdp portait sur une clé globale.
    Dix tentatives avec des jetons invalides depuis une seule IP suffisaient à
    renvoyer 429 à tout le monde — un attaquant pouvait ainsi empêcher tous les
    utilisateurs de réinitialiser leur mot de passe pendant une minute.
    """
    auth._rate_limits.clear()

    # Phase 1 : on sature la limite depuis une IP avec des jetons invalides.
    session_inutile = FauxSession(user=None)
    async with _client(session_inutile) as c:
        codes = []
        for _ in range(auth.RATE_LIMIT_MAX + 5):
            r = await c.post(
                "/auth/reinitialiser-mdp",
                json={"token": "jeton-invalide", "nouveau_mot_de_passe": "Nouveau7Mdp"},
                headers={"x-forwarded-for": "10.0.0.1"},
            )
            codes.append(r.status_code)

    assert 429 in codes, "la protection anti-bruit doit rester active"

    # Phase 2 : un utilisateur légitime, avec un VRAI jeton et une autre IP,
    # doit pouvoir réinitialiser son mot de passe malgré la saturation.
    user = _faire_utilisateur()
    jeton_clair, ligne = _faire_jeton()
    session = FauxSession(user=user, jetons=[ligne])

    async with _client(session) as c:
        r = await c.post(
            "/auth/reinitialiser-mdp",
            json={"token": jeton_clair, "nouveau_mot_de_passe": "Nouveau7Mdp"},
            headers={"x-forwarded-for": "10.0.0.2"},
        )

    assert r.status_code == 200
    assert verify_password("Nouveau7Mdp", user.mot_de_passe_hash)

    auth._rate_limits.clear()


@pytest.mark.anyio
async def test_rate_limit_par_jeton_borne_les_essais_repetes():
    """Sur un même jeton, la limite s'applique bien : elle protège le lien
    d'un devinage répété sans dépendre de l'adresse IP."""
    auth._rate_limits.clear()

    user = _faire_utilisateur()
    jeton_clair, ligne = _faire_jeton()
    session = FauxSession(user=user, jetons=[ligne])

    codes = []
    async with _client(session) as c:
        for _ in range(auth.RATE_LIMIT_MAX + 3):
            r = await c.post(
                "/auth/reinitialiser-mdp",
                json={"token": jeton_clair, "nouveau_mot_de_passe": "Nouveau7Mdp"},
                headers={"x-forwarded-for": "10.0.0.3"},
            )
            codes.append(r.status_code)
            # Le jeton est consommé dès la première réussite : on le remet pour
            # que chaque itération atteigne réellement la clé du rate limit.
            ligne.utilise_a = None
            ligne.id = 1
            if session.jetons and session.jetons[0] is not ligne:
                session.jetons = [ligne]

    assert 429 in codes

    auth._rate_limits.clear()
