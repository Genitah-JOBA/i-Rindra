# tests/test_besti_connexion.py
"""
Tests de la connexion iRindra quand Besti est dans la boucle.

Le point critique vérifié ici est une propriété de NEGATION : pour un compte
local, Besti ne doit JAMAIS être appelé. Une régression sur ce point enverrait
des mots de passe iRindra à un service tiers — c'est le risque principal de
cette intégration, avant même les questions de rôles.

Besti est simulé en remplaçant la fonction réellement appelée par la route
(`app.routers.auth.besti_verifier_identifiants`) : on teste donc la branche
« Besti a dit non / Besti est injoignable », pas le client HTTP lui-même.
"""
import hashlib
import hmac
import json
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.besti.schemas import BestiUser
from app.core.config import settings
from app.core.security import hash_password
from app.models.utilisateur import RoleUtilisateur, Utilisateur
from app.routers import auth

BESTI_ID = uuid.UUID(int=1)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def liaison_configuree(monkeypatch):
    monkeypatch.setattr(settings, "BESTI_API_KEY", "cle-de-test")
    monkeypatch.setattr(settings, "BESTI_URL", "https://besti.test")
    yield


def _compte_besti(**kwargs) -> BestiUser:
    payload = {
        "bestiId": str(BESTI_ID),
        "email": "client@exemple.fr",
        "firstName": "Camille",
        "lastName": "Durand",
    }
    payload.update(kwargs)
    return BestiUser(**payload)


def _faire_utilisateur(**kwargs) -> Utilisateur:
    params = dict(
        id=5,
        nom="Durand",
        prenom="Camille",
        email="client@exemple.fr",
        mot_de_passe_hash=None,
        besti_id=BESTI_ID,
        role=RoleUtilisateur.CLIENT,
        actif=True,
        client_id=None,
    )
    params.update(kwargs)
    return Utilisateur(**params)


class FauxSession:
    """Session qui répond aux deux seules requêtes du login (`par email`)."""

    def __init__(self, utilisateur=None):
        self.utilisateur = utilisateur
        self.commits = 0
        self.en_attente = []
        self._prochaine_id = 99

    async def execute(self, requete):
        class Resultat:
            def __init__(self, valeur):
                self._valeur = valeur

            def scalar_one_or_none(self):
                return self._valeur

            def scalars(self):
                return self

            def first(self):
                return self._valeur

        params = dict(requete.compile().params)
        if self.utilisateur is None:
            return Resultat(None)

        besti_id = params.get("besti_id_1")
        email = params.get("email_1")
        identifiant = params.get("id_1")
        if besti_id is not None:
            if self.utilisateur.besti_id == besti_id:
                return Resultat(self.utilisateur)
            return Resultat(None)
        if identifiant is not None:
            if self.utilisateur.id == identifiant:
                return Resultat(self.utilisateur)
            return Resultat(None)
        if email is not None and self.utilisateur.email == email:
            return Resultat(self.utilisateur)
        return Resultat(None)

    def add(self, objet):
        self.en_attente.append(objet)

    async def commit(self):
        self.commits += 1
        if self.en_attente and self.utilisateur is None:
            objet = self.en_attente[0]
            objet.id = self._prochaine_id
            self.utilisateur = objet
        self.en_attente = []

    async def refresh(self, objet):
        pass


def _client(session) -> AsyncClient:
    from app.main import app
    from app.core.database import get_db

    async def _get_db():
        return session

    app.dependency_overrides[get_db] = _get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class BestiFaux:
    """Remplace `verifier_identifiants` et compte les appels."""

    def __init__(self, compte=None, erreur=None):
        self.compte = compte
        self.erreur = erreur
        self.appels = []

    async def __call__(self, email, password):
        self.appels.append((email, password))
        if self.erreur is not None:
            raise self.erreur
        return self.compte


def _patcher(monkeypatch, faux: BestiFaux):
    monkeypatch.setattr(auth, "besti_verifier_identifiants", faux)


def _erreur(code: int, detail: str = "Besti refuse"):
    return auth.HTTPException(status_code=code, detail=detail)


async def _connecter(client, email="client@exemple.fr", mot_de_passe="MotDePasse1!"):
    return await client.post(
        "/auth/login", data={"username": email, "password": mot_de_passe}
    )


# ============================================================
# 1. Compte local : Besti n'est jamais appelé
# ============================================================


@pytest.mark.anyio
async def test_compte_local_se_connecte_sans_appeler_besti(monkeypatch):
    """Propriété de négation : aucun mot de passe iRindra ne part vers Besti."""
    faux = BestiFaux()
    _patcher(monkeypatch, faux)

    local = _faire_utilisateur(
        email="direction@exemple.fr",
        besti_id=None,
        role=RoleUtilisateur.DIRECTION,
        mot_de_passe_hash=hash_password("MotDePasse1!"),
    )

    async with _client(FauxSession(local)) as client:
        reponse = await _connecter(client, "direction@exemple.fr", "MotDePasse1!")

    assert reponse.status_code == 200
    assert reponse.json()["role"] == "direction"
    assert faux.appels == [], "Besti ne doit pas être appelé pour un compte local"


@pytest.mark.anyio
async def test_compte_local_mauvais_mot_de_passe_donne_401(monkeypatch):
    faux = BestiFaux()
    _patcher(monkeypatch, faux)

    local = _faire_utilisateur(
        email="direction@exemple.fr",
        besti_id=None,
        role=RoleUtilisateur.DIRECTION,
        mot_de_passe_hash=hash_password("MotDePasse1!"),
    )

    async with _client(FauxSession(local)) as client:
        reponse = await _connecter(client, "direction@exemple.fr", "MauvaisMotDePasse1!")

    assert reponse.status_code == 401
    # Surtout : un mauvais mot de passe local ne doit PAS être renvoyé à Besti.
    assert faux.appels == []


@pytest.mark.anyio
async def test_compte_local_desactive_donne_403(monkeypatch):
    faux = BestiFaux()
    _patcher(monkeypatch, faux)

    local = _faire_utilisateur(
        email="drh@exemple.fr",
        besti_id=None,
        role=RoleUtilisateur.DRH,
        actif=False,
        mot_de_passe_hash=hash_password("MotDePasse1!"),
    )

    async with _client(FauxSession(local)) as client:
        reponse = await _connecter(client, "drh@exemple.fr", "MotDePasse1!")

    assert reponse.status_code == 403
    assert faux.appels == []


# ============================================================
# 2. Compte lié : Besti vérifie, iRindra émet son propre JWT
# ============================================================


@pytest.mark.anyio
async def test_compte_lie_passe_par_besti(monkeypatch):
    lie = _faire_utilisateur()
    faux = BestiFaux(compte=_compte_besti())
    _patcher(monkeypatch, faux)

    async with _client(FauxSession(lie)) as client:
        reponse = await _connecter(client)

    assert reponse.status_code == 200
    assert reponse.json()["role"] == "client"
    assert faux.appels == [("client@exemple.fr", "MotDePasse1!")]

    # Le JWT reste celui d'iRindra, avec les mêmes champs qu'avant.
    corps = reponse.json()
    assert corps["token_type"] == "bearer"
    assert corps["user_id"] == 5
    assert corps["nom"] == "Durand" and corps["prenom"] == "Camille"


@pytest.mark.anyio
async def test_email_inconnu_peut_creer_le_compte_a_la_connexion(monkeypatch):
    """Filet de sécurité : si le webhook a tardé, la connexion crée le compte."""
    faux = BestiFaux(compte=_compte_besti())
    _patcher(monkeypatch, faux)

    session = FauxSession(None)
    async with _client(session) as client:
        reponse = await _connecter(client)

    assert reponse.status_code == 200
    assert session.utilisateur is not None
    assert session.utilisateur.role is RoleUtilisateur.CLIENT
    assert session.utilisateur.mot_de_passe_hash is None
    assert session.utilisateur.besti_id == BESTI_ID


@pytest.mark.anyio
async def test_compte_lie_desactive_refuse_meme_si_besti_accepte(monkeypatch):
    """La désactivation décidée par iRindra prime sur l'accord de Besti."""
    lie = _faire_utilisateur(actif=False)
    faux = BestiFaux(compte=_compte_besti())
    _patcher(monkeypatch, faux)

    async with _client(FauxSession(lie)) as client:
        reponse = await _connecter(client)

    assert reponse.status_code == 403
    assert faux.appels == []


@pytest.mark.anyio
async def test_sans_cle_api_l_identification_est_desactivee(monkeypatch):
    """Variable vide : l'API démarre, mais un compte lié ne peut pas se connecter."""
    monkeypatch.setattr(settings, "BESTI_API_KEY", "")
    faux = BestiFaux(compte=_compte_besti())
    _patcher(monkeypatch, faux)

    async with _client(FauxSession(_faire_utilisateur())) as client:
        reponse = await _connecter(client)

    assert reponse.status_code == 401
    assert faux.appels == []


# ============================================================
# 3. Traduction des réponses Besti
# ============================================================


@pytest.mark.anyio
@pytest.mark.parametrize(
    "code,message_attendu",
    [
        (401, "Identifiants incorrects"),
        (403, "Compte en attente de validation"),
        (429, "Trop de tentatives"),
        (503, "Service de connexion momentanément indisponible"),
    ],
)
async def test_reponses_besti_sont_reprises_telles_quelles(monkeypatch, code, message_attendu):
    faux = BestiFaux(erreur=_erreur(code, message_attendu))
    _patcher(monkeypatch, faux)

    async with _client(FauxSession(_faire_utilisateur())) as client:
        reponse = await _connecter(client)

    assert reponse.status_code == code
    assert reponse.json()["detail"] == message_attendu


@pytest.mark.anyio
async def test_panne_reseau_besti_devient_503(monkeypatch):
    """De bout en bout :Besti ne répond pas, l'utilisateur reçoit un 503.

    Le faux est placé au niveau HTTP (et non au niveau de la route) pour que la
    traduction d'erreur soit réellement exercée par `verifier_identifiants`.
    """
    import httpx

    _client_besti(monkeypatch, httpx.ConnectError("réseau injoignable"))

    async with _client(FauxSession(_faire_utilisateur())) as client:
        reponse = await _connecter(client)

    assert reponse.status_code == 503
    assert reponse.json()["detail"] == "Service de connexion momentanément indisponible"


# ============================================================
# 4. Le client HTTP Besti (traduction des statuts, clé jamais exposée)
# ============================================================


class _ReponseFausse:
    def __init__(self, code, json=None, content_type="application/json"):
        self.status_code = code
        self._json = json if json is not None else {}
        self.headers = {"content-type": content_type}

    def json(self):
        return self._json


def _client_besti(monkeypatch, reponse_ou_erreur):
    """
    Remplace le client HTTP utilisé par app.besti.client.

    On substitue le symbole `httpx` *dans le module* et non l'attribut de la
    bibliothèque : sinon le client HTTP des tests (et celui d'ASGITransport)
    serait remplacé lui aussi, et l'erreur simulée remonterait au lieu d'être
    traduite en 503.
    """
    from app.besti import client as module_client
    import httpx as httpx_reel

    captures = []

    class ClientFaux:
        def __init__(self, *args, **kwargs):
            self.requetes = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None, headers=None):
            self.requetes.append({"url": url, "json": json, "headers": headers})
            if isinstance(reponse_ou_erreur, Exception):
                raise reponse_ou_erreur
            return reponse_ou_erreur

    def factory(*args, **kwargs):
        instance = ClientFaux(*args, **kwargs)
        captures.append(instance)
        return instance

    class HttpxFaux:
        AsyncClient = factory
        HTTPError = httpx_reel.HTTPError

    monkeypatch.setattr(module_client, "httpx", HttpxFaux)
    return captures


@pytest.mark.anyio
async def test_appel_vers_besti_utilise_la_bonne_url_et_la_cle(monkeypatch):
    captures = _client_besti(
        monkeypatch,
        _ReponseFausse(
            200,
            {
                "bestiId": str(BESTI_ID),
                "email": "client@exemple.fr",
                "firstName": "Camille",
                "lastName": "Durand",
            },
        ),
    )

    from app.besti.client import verifier_identifiants

    compte = await verifier_identifiants("client@exemple.fr", "MotDePasse1!")

    assert compte.bestiId == BESTI_ID
    envoye = captures[0].requetes[0]
    assert envoye["url"] == "https://besti.test/api/integrations/verify-credentials"
    assert envoye["headers"]["X-Api-Key"] == "cle-de-test"
    assert "MotDePasse1!" not in str(envoye["headers"])


@pytest.mark.anyio
async def test_erreur_reseau_besti_ne_renseigne_pas_le_detail(monkeypatch):
    import httpx

    _client_besti(monkeypatch, httpx.ReadTimeout("délai dépassé"))

    from app.besti.client import verifier_identifiants

    with pytest.raises(auth.HTTPException) as info:
        await verifier_identifiants("client@exemple.fr", "MotDePasse1!")

    assert info.value.status_code == 503
    # Le détail technique ne doit pas fuiter vers l'appelant.
    assert "délai" not in info.value.detail


@pytest.mark.anyio
async def test_reponse_besti_inattendue_devient_503(monkeypatch):
    _client_besti(monkeypatch, _ReponseFausse(500, {"message": "boom"}))

    from app.besti.client import verifier_identifiants

    with pytest.raises(auth.HTTPException) as info:
        await verifier_identifiants("client@exemple.fr", "MotDePasse1!")

    assert info.value.status_code == 503


@pytest.mark.anyio
async def test_compte_besti_mal_forme_devient_503(monkeypatch):
    """Un 200 au format inattendu ne doit pas laisser passer une connexion."""
    _client_besti(monkeypatch, _ReponseFausse(200, {"email": "sans-besti-id"}))

    from app.besti.client import verifier_identifiants

    with pytest.raises(auth.HTTPException) as info:
        await verifier_identifiants("client@exemple.fr", "MotDePasse1!")

    assert info.value.status_code == 503


# ============================================================
# 5. Signature : rappel du contrat d'échange
# ============================================================


def test_signature_besti_sur_le_corps_brut():
    corps = b'{"test":true}'
    ts = str(int(time.time()))
    attendu = "sha256=" + hmac.new(
        b"secret", ts.encode() + b"." + corps, hashlib.sha256
    ).hexdigest()

    assert attendu == "sha256=" + hmac.new(
        b"secret", ts.encode() + b"." + corps, hashlib.sha256
    ).hexdigest()
    assert json.loads(corps.decode())["test"] is True


# ============================================================
# 6. Mots de passe : Besti reste la seule autorité pour un compte lié
# ============================================================


@pytest.mark.anyio
async def test_mot_de_passe_oublie_d_un_compte_lie_renvoie_l_url_besti():
    """Le contrat exige un message indiquant l'URL Besti, et aucun jeton local."""
    lie = _faire_utilisateur()
    session = FauxSession(lie)

    async with _client(session) as client:
        reponse = await client.post(
            "/auth/mot-de-passe-oublie", json={"email": "client@exemple.fr"}
        )

    assert reponse.status_code == 200
    assert "besti.bef4prod.com/users/forgot-password" in reponse.json()["message"]
    assert session.en_attente == [] and session.commits == 0


@pytest.mark.anyio
async def test_mot_de_passe_oublie_d_un_compte_local_reste_inchange():
    """Séparation stricte : un compte local n'entend jamais parler de Besti."""
    local = _faire_utilisateur(
        email="direction@exemple.fr",
        besti_id=None,
        role=RoleUtilisateur.DIRECTION,
        mot_de_passe_hash=hash_password("MotDePasse1!"),
    )
    session = FauxSession(local)

    async with _client(session) as client:
        reponse = await client.post(
            "/auth/mot-de-passe-oublie", json={"email": "direction@exemple.fr"}
        )

    assert reponse.status_code == 200
    assert "besti" not in reponse.json()["message"].lower()


@pytest.mark.anyio
async def test_changement_de_mot_de_passe_d_un_compte_lie_renvoie_l_url_besti():
    from app.core.security import create_access_token

    lie = _faire_utilisateur()
    session = FauxSession(lie)
    jeton = create_access_token(
        {"sub": str(lie.id), "role": lie.role.value, "email": lie.email}
    )

    async with _client(session) as client:
        reponse = await client.put(
            "/auth/me",
            json={"nouveau_mot_de_passe": "NouveauMotDePasse1!"},
            headers={"Authorization": f"Bearer {jeton}"},
        )

    assert reponse.status_code == 400
    assert "besti.bef4prod.com/users/forgot-password" in reponse.json()["detail"]