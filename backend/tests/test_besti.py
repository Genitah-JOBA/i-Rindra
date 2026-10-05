# tests/test_besti.py
"""Comptes clients partagés avec Besti : webhook d'entrée et vérification
d'identifiants.

Aucune base réelle : une fausse session reconnaît chaque requête à son SQL, sur
le modèle de `test_reinitialisation_mdp.py`. Ce qui est vérifié ici, ce sont
les propriétés de sécurité du contrat d'échange :

- la signature protège le corps (un octet modifié change la réponse) ;
- l'horodatage borne le rejeu ;
- un corps invalide répond 400, jamais le 422 automatique de FastAPI ;
- un compte local n'est jamais ni modifié ni rattaché (409) ;
- un rejeu d'événement ne crée pas de doublon.

Et, pour la connexion, que Besti n'est jamais interrogé pour un compte local.
"""
import hashlib
import hmac
import json
import time
import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.besti.service import appliquer
from app.core.config import settings
from app.core.security import hash_password
from app.models.utilisateur import RoleUtilisateur, Utilisateur
from app.routers import auth

SECRET = "secret-de-test-besti"


@pytest.fixture
def anyio_backend():
    return "asyncio"


# --- Fausse base ------------------------------------------------------------

class ResultatFaux:
    def __init__(self, valeur):
        self._valeur = valeur

    def scalar_one_or_none(self):
        return self._valeur

    def scalars(self):
        return self

    def first(self):
        # `scalars().first()` : le service l'utilise pour certain(e)s lectures.
        return self._valeur


class FauxSession:
    """Session SQLAlchemy de substitution : `utilisateurs` tient la table."""

    def __init__(self, utilisateurs=None):
        self.utilisateurs = list(utilisateurs or [])
        self.ajouts = 0
        self.commits = 0
        self._prochain_id = 1000

    async def execute(self, requete):
        params = dict(requete.compile().params)
        sql = str(requete)
        if "FROM utilisateur" not in sql:
            return ResultatFaux(None)

        def _valeur(colonne: str):
            # SQLAlchemy suffixe les noms de paramètre (`email_1`) pour éviter
            # une collision avec le nom de colonne lui-même.
            for cle, v in params.items():
                if cle == colonne or cle.startswith(colonne + "_"):
                    return v
            return None

        besti_id = _valeur("besti_id")
        if besti_id is not None:
            return ResultatFaux(
                self._premier(lambda u: u.besti_id is not None and u.besti_id == besti_id)
            )

        return ResultatFaux(self._premier(lambda u: u.email == _valeur("email")))

    def _premier(self, condition):
        return next((u for u in self.utilisateurs if condition(u)), None)

    def add(self, utilisateur):
        self.ajouts += 1
        self._prochain_id += 1
        utilisateur.id = self._prochain_id
        self.utilisateurs.append(utilisateur)

    async def commit(self):
        self.commits += 1

    async def refresh(self, utilisateur):
        pass


def _local(email="direction@exemple.fr", role=RoleUtilisateur.DIRECTION):
    return Utilisateur(
        id=1,
        email=email,
        nom="Direction",
        prenom="La",
        mot_de_passe_hash=hash_password("MotDePasse1"),
        besti_id=None,
        role=role,
        actif=True,
    )


def _charge(*, besti_id=None, email="client@exemple.fr", first="Marie", last="Curie"):
    return {
        "bestiId": str(besti_id or uuid.uuid4()),
        "email": email,
        "firstName": first,
        "lastName": last,
        "companyName": "SCI Curie",
        "status": "Actif",
    }


# --- Signature --------------------------------------------------------------

def _signer(corps: bytes, ts: str | None = None, secret: str = SECRET) -> dict:
    ts = ts or str(int(time.time()))
    signature = "sha256=" + hmac.new(
        secret.encode(), ts.encode() + b"." + corps, hashlib.sha256
    ).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Besti-Event": "ping",
        "X-Besti-Timestamp": ts,
        "X-Besti-Signature": signature,
    }


def _client(session):
    from app.main import app

    async def _get_db():
        return session

    app.dependency_overrides[auth.get_db] = _get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def session():
    return FauxSession()


@pytest.fixture(autouse=True)
def _secret_configure(monkeypatch):
    monkeypatch.setattr(settings, "BESTI_WEBHOOK_SECRET", SECRET, raising=False)
    monkeypatch.setattr(settings, "BESTI_API_KEY", "cle-de-test", raising=False)
    # Le rate limiting mémoire est partagé entre tests : on l'ouvre pour ne pas
    # confondre un 429 de la liaison avec un 429 du mécanisme anti-bruit.
    monkeypatch.setattr(auth, "RATE_LIMIT_MAX", 10_000, raising=False)


# --- 1. Webhook : signature -------------------------------------------------

@pytest.mark.anyio
async def test_ping_signé_ne_rién_crée(session):
    """Un ping de liaison ne doit toucher à rien, même signé correctement."""
    corps = b'{"test":true}'
    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=_signer(corps))

    assert r.status_code == 204
    assert r.content == b"", "le webhook ne renvoie aucun corps"
    assert session.utilisateurs == []


@pytest.mark.anyio
async def test_ping_signature_fausse_refusé(session):
    corps = b'{"test":true}'
    entetes = _signer(corps, secret="mauvais-secret")
    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=entetes)

    assert r.status_code == 401
    assert session.utilisateurs == []


@pytest.mark.anyio
async def test_corps_modifié_d_un_octet_refusé(session):
    """La signature porte sur les octets bruts : un octet de différence suffit
    à invalider l'envoi. C'est ce qui empêche de faire passer un corps bricolé
    sous une signature valide."""
    corps = b'{"test":true}'
    entetes = _signer(corps)
    corps_altere = b'{"test":true }'  # un espace de plus

    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps_altere, headers=entetes)

    assert r.status_code == 401
    assert session.utilisateurs == []


@pytest.mark.anyio
async def test_horodatage_trop_ancien_refusé(session):
    corps = b'{"test":true}'
    ts = str(int(time.time()) - 400)
    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=_signer(corps, ts=ts))

    assert r.status_code == 401


@pytest.mark.anyio
async def test_horodatage_non_numérique_refusé(session):
    corps = b'{"test":true}'
    entetes = _signer(corps)
    entetes["X-Besti-Timestamp"] = "hier"
    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=entetes)

    assert r.status_code == 401


@pytest.mark.anyio
@pytest.mark.parametrize("en_tete", ["X-Besti-Timestamp", "X-Besti-Signature"])
async def test_en_têtes_absents_refusés(session, en_tete):
    corps = b'{"test":true}'
    entetes = _signer(corps)
    entetes.pop(en_tete)
    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=entetes)

    assert r.status_code == 401


@pytest.mark.anyio
async def test_secret_non_configuré_refuse_tout(session, monkeypatch):
    """Sans secret, la liaison est inactive : rien ne passe, et le secret
    manquant ne se devine pas dans le message."""
    monkeypatch.setattr(settings, "BESTI_WEBHOOK_SECRET", "", raising=False)
    corps = b'{"test":true}'
    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=_signer(corps))

    assert r.status_code == 401


@pytest.mark.anyio
async def test_événement_inconnu_refusé_en_400(session):
    corps = b'{"test":true}'
    entetes = _signer(corps)
    entetes["X-Besti-Event"] = "user.supprime"
    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=entetes)

    assert r.status_code == 400


# --- 2. Webhook : corps -----------------------------------------------------

@pytest.mark.anyio
async def test_activation_crée_un_compte_client(session):
    besti_id = uuid.uuid4()
    corps = json.dumps(_charge(besti_id=besti_id)).encode()
    entetes = _signer(corps)
    entetes["X-Besti-Event"] = "user.activated"

    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=entetes)

    assert r.status_code == 204
    assert len(session.utilisateurs) == 1
    u = session.utilisateurs[0]
    assert u.besti_id == besti_id
    assert u.email == "client@exemple.fr"
    assert u.prenom == "Marie" and u.nom == "Curie"
    assert u.role == RoleUtilisateur.CLIENT
    assert u.mot_de_passe_hash is None, "le mot de passe reste chez Besti"
    assert u.actif is True


@pytest.mark.anyio
async def test_corps_invalide_renvoie_400_pas_422(session):
    """Le contrat impose 400. Un paramètre Pydantic ferait répondre 422 par
    FastAPI avant même que le code ne voie la requête."""
    corps = b'{"bestiId": "pas-un-uuid"}'
    entetes = _signer(corps)
    entetes["X-Besti-Event"] = "user.activated"

    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=entetes)

    assert r.status_code == 400, "un corps invalide doit répondre 400, pas 422"
    assert session.utilisateurs == []


@pytest.mark.anyio
async def test_json_invalide_renvoie_400_pas_422(session):
    corps = b"{pas du json"
    entetes = _signer(corps)
    entetes["X-Besti-Event"] = "user.activated"

    async with _client(session) as client:
        r = await client.post("/besti/webhook", content=corps, headers=entetes)

    assert r.status_code == 400


@pytest.mark.anyio
async def test_rejeu_du_meme_evenement_ne_duplique_pas():
    """Besti peut réexpédier un événement (reprise, timeout). L'upsert se fait
    sur `besti_id` : le rejeu met à jour, il ne duplique pas."""
    besti_id = uuid.uuid4()
    session = FauxSession()
    charge = _charge(besti_id=besti_id)

    await appliquer(session, "user.activated", _valider(charge))
    await appliquer(session, "user.activated", _valider(charge))

    assert len(session.utilisateurs) == 1


# --- 3. Service -------------------------------------------------------------

def _valider(charge: dict):
    from app.besti.schemas import BestiUser

    return BestiUser.model_validate(charge)


@pytest.mark.anyio
async def test_mise_à_jour_change_le_nom(session):
    besti_id = uuid.uuid4()
    await appliquer(session, "user.activated", _valider(_charge(besti_id=besti_id)))
    await appliquer(
        session, "user.updated", _valider(_charge(besti_id=besti_id, last="Curie-Skłodowska"))
    )

    assert len(session.utilisateurs) == 1
    assert session.utilisateurs[0].nom == "Curie-Skłodowska"


@pytest.mark.anyio
async def test_email_d_un_compte_local_refusé_et_compte_intact(session):
    """Jamais de fusion par email : le compte local garde son rôle, son hash et
    son email. Le client Besti est refusé, pas absorbé."""
    session.utilisateurs.append(_local(email="direction@exemple.fr"))
    charge = _valider(_charge(email="direction@exemple.fr"))

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await appliquer(session, "user.activated", charge)

    assert exc.value.status_code == 409
    assert len(session.utilisateurs) == 1
    u = session.utilisateurs[0]
    assert u.role == RoleUtilisateur.DIRECTION
    assert u.besti_id is None
    assert u.mot_de_passe_hash is not None


@pytest.mark.anyio
async def test_désactivation_désactive_le_compte(session):
    besti_id = uuid.uuid4()
    await appliquer(session, "user.activated", _valider(_charge(besti_id=besti_id)))
    assert session.utilisateurs[0].actif is True

    await appliquer(session, "user.deactivated", _valider(_charge(besti_id=besti_id)))
    assert session.utilisateurs[0].actif is False


@pytest.mark.anyio
async def test_désactivation_d_un_compte_inconnu_ne_échoue_pas(session):
    """L'ordre des envois n'est pas garanti : une désactivation peut arriver
    avant la création. Elle doit rester sans effet et sans erreur."""
    assert await appliquer(session, "user.deactivated", _valider(_charge())) is None
    assert session.utilisateurs == []


@pytest.mark.anyio
async def test_evenement_inconnu_refuse():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await appliquer(FauxSession(), "user.supprime", _valider(_charge()))

    assert exc.value.status_code == 400


# --- 4. Connexion -----------------------------------------------------------

def _form(email: str) -> dict:
    return {"username": email, "password": "MotDePasse1"}


def _HttpErreur(code: int):
    """Simule une `HTTPException` levée par `besti_verifier_identifiants`."""
    from fastapi import HTTPException

    return HTTPException(status_code=code, detail="Besti a refusé")


@pytest.mark.anyio
async def test_compte_local_ne_appelle_pas_besti(session, monkeypatch):
    """Le point le plus important : un compte local se connecte exactement
    comme avant. Besti n'est pas appelé, même si la liaison est configurée."""
    session.utilisateurs.append(_local(email="local@exemple.fr"))
    appele = []

    async def _jamais_appele(*args, **kwargs):
        appele.append(args)
        raise AssertionError("Besti ne doit pas être interrogé pour un compte local")

    monkeypatch.setattr(auth, "besti_verifier_identifiants", _jamais_appele)

    async with _client(session) as client:
        r = await client.post("/auth/login", data=_form("local@exemple.fr"))

    assert r.status_code == 200, r.text
    assert appele == []
    assert r.json()["role"] == "direction"


@pytest.mark.anyio
async def test_identifiants_locaux_invalides_refusés(session, monkeypatch):
    session.utilisateurs.append(_local(email="local@exemple.fr"))

    async def _jamais_appele(*args, **kwargs):
        raise AssertionError("Besti ne doit pas être interrogé")

    monkeypatch.setattr(auth, "besti_verifier_identifiants", _jamais_appele)

    async with _client(session) as client:
        r = await client.post("/auth/login", data=_form("local@exemple.fr") | {"password": "faux"})

    assert r.status_code == 401


@pytest.mark.anyio
async def test_compte_liaison_appelle_besti(session, monkeypatch):
    """Email inconnu chez iRindra : Besti valide, iRindra crée le compte lié et
    émet son propre JWT."""
    besti_id = uuid.uuid4()
    vus = []

    async def _faux(email, password):
        vus.append((email, password))
        return _valider(_charge(besti_id=besti_id, email=email))

    monkeypatch.setattr(auth, "besti_verifier_identifiants", _faux)

    async with _client(session) as client:
        r = await client.post("/auth/login", data=_form("nouveau@exemple.fr"))

    assert r.status_code == 200, r.text
    assert vus == [("nouveau@exemple.fr", "MotDePasse1")]
    assert r.json()["role"] == "client", "un client Besti est un rôle client"
    assert len(session.utilisateurs) == 1
    assert session.utilisateurs[0].mot_de_passe_hash is None


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("code_besti", "attendu"),
    [
        (401, 401),  # mauvais mot de passe
        (403, 403),  # compte en attente / refusé
        (429, 429),  # trop de tentatives
    ],
)
async def test_erreurs_besti_remontent_telles_elles(session, monkeypatch, code_besti, attendu):
    """`verifier_identifiants` a déjà traduit : la connexion ne doit pas
    réécrire le code, seulement le laisser passer jusqu'au client."""

    async def _faux(email, password):
        raise _HttpErreur(code_besti)

    monkeypatch.setattr(auth, "besti_verifier_identifiants", _faux)

    async with _client(session) as client:
        r = await client.post("/auth/login", data=_form(f"inconnu{code_besti}@exemple.fr"))

    assert r.status_code == attendu


# --- 4bis. Traduction des réponses Besti (besti/client.py) ------------------

def _boucher_httpx(monkeypatch, gestionnaire):
    """Remplace le transport httpx utilisé par `verifier_identifiants`."""
    import httpx as httpx_module
    import app.besti.client as client_besti

    transport = httpx_module.MockTransport(gestionnaire)
    original = httpx_module.AsyncClient

    monkeypatch.setattr(
        httpx_module, "AsyncClient", lambda **kw: original(transport=transport, **kw)
    )


@pytest.mark.anyio
@pytest.mark.parametrize("code", [500, 502, 404])
async def test_panne_besti_devient_503(monkeypatch, code):
    """Une panne Besti ne doit jamais ressortir en 500 : l'utilisateur verrait
    une erreur iRindra alors que le problème est ailleurs. 503 = réessayer."""
    import httpx as httpx_module
    from app.besti.client import verifier_identifiants

    _boucher_httpx(monkeypatch, lambda request: httpx_module.Response(code, json={}))

    with pytest.raises(HTTPException) as exc:
        await verifier_identifiants("client@exemple.fr", "MotDePasse1")

    assert exc.value.status_code == 503


@pytest.mark.anyio
async def test_reseau_injoignable_devient_503(monkeypatch):
    """Panne réseau, DNS, délai dépassé : le client n'a rien à en faire, on ne
    distingue pas les causes."""
    import httpx as httpx_module
    from app.besti.client import verifier_identifiants

    def _explose(request):
        raise httpx_module.ConnectError("connexion refusée")

    _boucher_httpx(monkeypatch, _explose)

    with pytest.raises(HTTPException) as exc:
        await verifier_identifiants("client@exemple.fr", "MotDePasse1")

    assert exc.value.status_code == 503


@pytest.mark.anyio
async def test_message_besti_transmis_en_403(monkeypatch):
    """Besti explique pourquoi (en attente, refusé, pas client) : son message
    est affiché tel quel, il est plus utile qu'un 403 nu."""
    import httpx as httpx_module
    from app.besti.client import verifier_identifiants

    _boucher_httpx(
        monkeypatch,
        lambda request: httpx_module.Response(403, json={"message": "Compte en attente de validation"}),
    )

    with pytest.raises(HTTPException) as exc:
        await verifier_identifiants("client@exemple.fr", "MotDePasse1")

    assert exc.value.status_code == 403
    assert exc.value.detail == "Compte en attente de validation"


@pytest.mark.anyio
async def test_200_retourne_le_compte_besti(monkeypatch):
    import httpx as httpx_module
    from app.besti.client import verifier_identifiants

    besti_id = uuid.uuid4()
    _boucher_httpx(monkeypatch, lambda request: httpx_module.Response(200, json=_charge(besti_id=besti_id)))

    compte = await verifier_identifiants("client@exemple.fr", "MotDePasse1")
    assert compte.bestiId == besti_id


@pytest.mark.anyio
async def test_200_illisible_devient_503(monkeypatch):
    """Un 200 dont le corps ne respecte pas le contrat ne doit pas laisser
    quelqu'un se connecter « sur la foi » d'une réponse inexploitable."""
    import httpx as httpx_module
    from app.besti.client import verifier_identifiants

    _boucher_httpx(monkeypatch, lambda request: httpx_module.Response(200, json={"nimporte": "quoi"}))

    with pytest.raises(HTTPException) as exc:
        await verifier_identifiants("client@exemple.fr", "MotDePasse1")

    assert exc.value.status_code == 503


@pytest.mark.anyio
async def test_sans_clé_api_compte_liaison_refusé(session, monkeypatch):
    """Liaison inactive : un email inconnu est traité comme un mauvais mot de
    passe, sans révéler que Besti existe."""
    monkeypatch.setattr(settings, "BESTI_API_KEY", "", raising=False)

    async def _jamais_appele(*args, **kwargs):
        raise AssertionError("Besti ne doit pas être interrogé sans clé")

    monkeypatch.setattr(auth, "besti_verifier_identifiants", _jamais_appele)

    async with _client(session) as client:
        r = await client.post("/auth/login", data=_form("inconnu@exemple.fr"))

    assert r.status_code == 401


@pytest.mark.anyio
async def test_compte_lié_désactivé_refusé(session, monkeypatch):
    """Un client désactivé par Besti ne peut plus se connecter, même si Besti
    valide encore le mot de passe."""

    async def _faux(email, password):
        return _valider(_charge(besti_id=uuid.uuid4(), email=email))

    monkeypatch.setattr(auth, "besti_verifier_identifiants", _faux)
    u = Utilisateur(
        id=2,
        email="desactive@exemple.fr",
        nom="Curie",
        prenom="Marie",
        mot_de_passe_hash=None,
        besti_id=uuid.uuid4(),
        role=RoleUtilisateur.CLIENT,
        actif=False,
    )
    session.utilisateurs.append(u)

    async with _client(session) as client:
        r = await client.post("/auth/login", data=_form("desactive@exemple.fr"))

    assert r.status_code == 403


# --- 5. Mot de passe des comptes liés ---------------------------------------

@pytest.mark.anyio
async def test_mot_de_passe_oublie_renvoie_vers_besti(session):
    """Un compte lié n'a aucun hash local : aucun jeton ne doit être créé, et la
    réponse doit renvoyer vers Besti, seule autorité sur ce mot de passe."""
    u = Utilisateur(
        id=3,
        email="client-besti@exemple.fr",
        nom="Curie",
        prenom="Marie",
        mot_de_passe_hash=None,
        besti_id=uuid.uuid4(),
        role=RoleUtilisateur.CLIENT,
        actif=True,
    )
    session.utilisateurs.append(u)

    async with _client(session) as client:
        r = await client.post(
            "/auth/mot-de-passe-oublie", json={"email": "client-besti@exemple.fr"}
        )

    assert r.status_code == 200
    assert r.json()["lien_reinitialisation"] is None, "aucun lien ne doit être produit"
    assert "besti.bef4prod.com/users/forgot-password" in r.json()["message"]
    assert session.commits == 0, "aucun jeton ne doit être écrit"


@pytest.mark.anyio
async def test_mot_de_passe_oublie_fonctionne_pour_un_compte_local(session):
    """Le flux local doit rester intact : un jeton est bien créé."""
    session.utilisateurs.append(_local(email="local2@exemple.fr"))

    async with _client(session) as client:
        r = await client.post(
            "/auth/mot-de-passe-oublie", json={"email": "local2@exemple.fr"}
        )

    assert r.status_code == 200
    assert session.commits == 1, "le flux local doit toujours créer un jeton"


# --- 6. verify_password avec hash absent ------------------------------------

def test_verify_password_refuse_un_hash_absent_sans_lever():
    """Un compte lié n'a pas de hash : la vérification doit refuser proprement,
    pas lever une exception (500) devant l'utilisateur."""
    from app.core.security import verify_password

    assert verify_password("MotDePasse1", None) is False
    assert verify_password("MotDePasse1", "") is False


def test_verify_password_accepte_un_hash_local():
    from app.core.security import verify_password

    assert verify_password("MotDePasse1", hash_password("MotDePasse1")) is True
    assert verify_password("Autre", hash_password("MotDePasse1")) is False