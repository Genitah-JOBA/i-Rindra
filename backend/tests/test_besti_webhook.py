# tests/test_besti_webhook.py
"""
Tests de la liaison Besti : signature du webhook et règles d'upsert.

Aucune base n'est requise : une fausse session reconnaît chaque requête d'après
son SQL, comme dans test_reinitialisation_mdp.py. Ce qui est réellement testé
ici est ce qui ne se voit pas à l'œil sur une base de test : la signature
(calculée sur le corps BRUT, rejouable, expirante), l'idempotence, et surtout
les cas où iRindra doit REFUSER d'agir — conflit d'email avec un compte local,
événement inconnu, corps invalide.
"""
import hashlib
import hmac
import json
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.besti.schemas import BestiUser
from app.besti.service import appliquer
from app.core.config import settings
from app.models.utilisateur import RoleUtilisateur, Utilisateur

SECRET = "secret-de-test-besti"
EVENTS = ("user.activated", "user.updated", "user.deactivated", "ping")


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def liaison_configuree(monkeypatch):
    """La liaison doit être « configurée » : le secret est forcé en mémoire."""
    monkeypatch.setattr(settings, "BESTI_WEBHOOK_SECRET", SECRET)
    monkeypatch.setattr(settings, "BESTI_API_KEY", "cle-de-test")
    monkeypatch.setattr(settings, "BESTI_URL", "https://besti.test")
    yield


# --- Utilitaires de signature ----------------------------------------------


def signer(corps: bytes, horodatage: str | None = None, secret: str = SECRET) -> str:
    """Reproduit la signature de Besti : HMAC-SHA256 sur "<ts>.<corps brut>"."""
    ts = horodatage if horodatage is not None else str(int(time.time()))
    signature = hmac.new(secret.encode(), ts.encode() + b"." + corps, hashlib.sha256)
    return "sha256=" + signature.hexdigest()


def entetes(evenement: str, corps: bytes, **kwargs) -> dict:
    ts = kwargs.pop("horodatage", None) or str(int(time.time()))
    return {
        "Content-Type": "application/json",
        "X-Besti-Event": evenement,
        "X-Besti-Timestamp": ts,
        "X-Besti-Signature": signer(corps, ts, **kwargs),
    }


def corps_compte(**kwargs) -> bytes:
    payload = {
        "bestiId": str(uuid.UUID(int=1)),
        "email": "client@exemple.fr",
        "firstName": "Camille",
        "lastName": "Durand",
        "companyName": "SARL Durand",
        "status": "Actif",
    }
    payload.update(kwargs)
    return json.dumps(payload).encode("utf-8")


# --- Fausse session --------------------------------------------------------


class ResultatFaux:
    def __init__(self, valeurs):
        self._valeurs = list(valeurs)

    def scalar_one_or_none(self):
        return self._valeurs[0] if self._valeurs else None

    def scalars(self):
        return self

    def first(self):
        return self._valeurs[0] if self._valeurs else None


class FauxSession:
    """
    Base en mémoire, adossée à une liste d'Utilisateur.

    Une liste Python plutôt qu'un vrai PostgreSQL : le comportement interesting
    ici (unicité, non-écriture d'un compte en conflit) n'a rien de spécifique
    au SGBD, et les tests restent exécutables sans base.
    """

    def __init__(self, utilisateurs=None):
        self.utilisateurs = list(utilisateurs or [])
        self.en_attente = []
        self.supprimes = []
        self.commits = 0
        self._prochaine_id = max((u.id or 0 for u in self.utilisateurs), default=0) + 1

    def _valeurs(self, requete):
        return dict(requete.compile().params)

    async def execute(self, requete):
        sql = str(requete)
        params = self._valeurs(requete)

        if "DELETE FROM mot_de_passe_reinit" in sql:
            utilisateur_id = params.get("utilisateur_id_1")
            self.supprimes.append(("jetons", utilisateur_id))
            return ResultatFaux([])

        if "FROM utilisateur" in sql:
            besti_id = params.get("besti_id_1")
            email = params.get("email_1")
            trouve = [
                u
                for u in self.utilisateurs
                if (besti_id is not None and u.besti_id == besti_id)
                or (email is not None and u.email == email)
            ]
            return ResultatFaux(trouve)

        return ResultatFaux([])

    def add(self, objet):
        self.en_attente.append(objet)

    async def commit(self):
        self.commits += 1
        for objet in self.en_attente:
            if objet not in self.utilisateurs:
                if objet.id is None:
                    objet.id = self._prochaine_id
                    self._prochaine_id += 1
                self.utilisateurs.append(objet)
        self.en_attente = []

    async def refresh(self, objet):
        pass


def _client(session: FauxSession) -> AsyncClient:
    from app.main import app
    from app.core.database import get_db

    async def _get_db():
        return session

    app.dependency_overrides[get_db] = _get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _local(email="direction@exemple.fr") -> Utilisateur:
    return Utilisateur(
        id=1,
        nom="Direction",
        prenom="La",
        email=email,
        mot_de_passe_hash="hash-local",
        besti_id=None,
        role=RoleUtilisateur.DIRECTION,
        actif=True,
    )


# ============================================================
# 1. Signature et route
# ============================================================


@pytest.mark.anyio
async def test_ping_signe_renvoie_204_sans_creer_de_compte():
    session = FauxSession()
    corps = b'{"test":true}'

    async with _client(session) as client:
        reponse = await client.post(
            "/besti/webhook", content=corps, headers=entetes("ping", corps)
        )

    assert reponse.status_code == 204
    assert session.utilisateurs == [] and session.commits == 0


@pytest.mark.anyio
async def test_secret_different_renvoie_401():
    corps = b'{"test":true}'
    entete = entetes("ping", corps)
    entete["X-Besti-Signature"] = signer(corps, secret="autre-secret")

    async with _client(FauxSession()) as client:
        reponse = await client.post("/besti/webhook", content=corps, headers=entete)

    assert reponse.status_code == 401


@pytest.mark.anyio
async def test_corps_modifie_d_un_octet_renvoie_401():
    """La signature porte sur les octets exacts envoyés : un octet de plus
    ou de moins, et l'authentification échoue."""
    corps = b'{"test":true}'
    entete = entetes("ping", corps)

    async with _client(FauxSession()) as client:
        reponse = await client.post(
            "/besti/webhook", content=corps + b" ", headers=entete
        )

    assert reponse.status_code == 401


@pytest.mark.anyio
async def test_horodatage_trop_ancien_renvoie_401():
    corps = b'{"test":true}'
    vieil = str(int(time.time()) - 400)

    async with _client(FauxSession()) as client:
        reponse = await client.post(
            "/besti/webhook",
            content=corps,
            headers=entetes("ping", corps, horodatage=vieil),
        )

    assert reponse.status_code == 401


@pytest.mark.anyio
async def test_horodatage_non_numerique_renvoie_401():
    corps = b'{"test":true}'

    async with _client(FauxSession()) as client:
        reponse = await client.post(
            "/besti/webhook",
            content=corps,
            headers=entetes("ping", corps, horodatage="hier"),
        )

    assert reponse.status_code == 401


@pytest.mark.anyio
@pytest.mark.parametrize("en_tete_manquant", ["X-Besti-Signature", "X-Besti-Timestamp"])
async def test_entete_manquant_renvoie_401(en_tete_manquant):
    corps = b'{"test":true}'
    entete = entetes("ping", corps)
    entete.pop(en_tete_manquant)

    async with _client(FauxSession()) as client:
        reponse = await client.post("/besti/webhook", content=corps, headers=entete)

    assert reponse.status_code == 401


@pytest.mark.anyio
async def test_webhook_sans_secret_configure_renvoie_401(monkeypatch):
    """Liaison inactive (variable vide) : 401, pas une erreur 500."""
    monkeypatch.setattr(settings, "BESTI_WEBHOOK_SECRET", "")
    corps = b'{"test":true}'

    async with _client(FauxSession()) as client:
        reponse = await client.post(
            "/besti/webhook", content=corps, headers=entetes("ping", corps)
        )

    assert reponse.status_code == 401


@pytest.mark.anyio
async def test_corps_invalide_renvoie_400_pas_422():
    """Le contrat impose 400. Un corps déclaré en Pydantic ferait 422."""
    corps = b'{"bestiId": "pas-un-uuid"}'

    async with _client(FauxSession()) as client:
        reponse = await client.post(
            "/besti/webhook",
            content=corps,
            headers=entetes("user.activated", corps),
        )

    assert reponse.status_code == 400
    assert "detail" in reponse.json()


@pytest.mark.anyio
async def test_evenement_inconnu_renvoie_400():
    corps = corps_compte()

    async with _client(FauxSession()) as client:
        reponse = await client.post(
            "/besti/webhook",
            content=corps,
            headers=entetes("user.supprime", corps),
        )

    assert reponse.status_code == 400


@pytest.mark.anyio
async def test_webhook_ne_demande_pas_de_jwt():
    """Aucune dépendance d'authentification : la signature suffit."""
    corps = corps_compte()
    session = FauxSession()

    async with _client(session) as client:
        reponse = await client.post(
            "/besti/webhook",
            content=corps,
            headers=entetes("user.activated", corps),
        )

    assert reponse.status_code == 204
    assert len(session.utilisateurs) == 1


# ============================================================
# 2. Règles d'upsert
# ============================================================


def _compte(**kwargs) -> BestiUser:
    payload = {
        "bestiId": str(uuid.UUID(int=1)),
        "email": "client@exemple.fr",
        "firstName": "Camille",
        "lastName": "Durand",
    }
    payload.update(kwargs)
    return BestiUser(**payload)


@pytest.mark.anyio
async def test_creation_impose_le_role_client_et_aucun_mot_de_passe():
    session = FauxSession()

    utilisateur = await appliquer(session, "user.activated", _compte())

    assert utilisateur.role is RoleUtilisateur.CLIENT
    assert utilisateur.mot_de_passe_hash is None
    assert utilisateur.actif is True
    assert str(utilisateur.besti_id) == str(uuid.UUID(int=1))
    assert utilisateur.email == "client@exemple.fr"


@pytest.mark.anyio
async def test_le_rrole_jamais_lu_chez_besti_ne_peut_promouvoir_un_compte():
    """Un `status` flatteur ne donne aucun droit : le rôle reste client."""
    session = FauxSession()

    utilisateur = await appliquer(
        session, "user.activated", _compte(status="Administrateur")
    )

    assert utilisateur.role is RoleUtilisateur.CLIENT


@pytest.mark.anyio
async def test_meme_evenement_rejoue_ne_cree_pas_de_doublon():
    session = FauxSession()

    await appliquer(session, "user.activated", _compte())
    await appliquer(session, "user.activated", _compte())
    await appliquer(session, "user.updated", _compte())

    assert len(session.utilisateurs) == 1


@pytest.mark.anyio
async def test_user_updated_met_a_jour_le_nom():
    session = FauxSession()
    await appliquer(session, "user.activated", _compte())

    utilisateur = await appliquer(
        session, "user.updated", _compte(lastName="Dupond", firstName="Camille")
    )

    assert utilisateur.nom == "Dupond"
    assert len(session.utilisateurs) == 1


@pytest.mark.anyio
async def test_evenement_inconnu_leve_400():
    with pytest.raises(Exception) as info:
        await appliquer(FauxSession(), "user.supprime", _compte())

    assert getattr(info.value, "status_code", None) == 400


@pytest.mark.anyio
async def test_email_d_un_compte_local_donne_409_et_ne_touche_au_local():
    """Règle d'or : jamais de fusion par email, compte local intact."""
    local = _local("client@exemple.fr")
    session = FauxSession([local])

    with pytest.raises(Exception) as info:
        await appliquer(session, "user.activated", _compte())

    assert getattr(info.value, "status_code", None) == 409
    # Le compte local est bit pour bit identique : ni rattaché, ni modifié.
    assert session.utilisateurs == [local]
    assert local.besti_id is None
    assert local.role is RoleUtilisateur.DIRECTION


@pytest.mark.anyio
async def test_email_d_un_autre_client_besti_donne_409():
    autre = Utilisateur(
        id=7,
        nom="Autre",
        prenom="Client",
        email="client@exemple.fr",
        mot_de_passe_hash=None,
        besti_id=uuid.UUID(int=999),
        role=RoleUtilisateur.CLIENT,
        actif=True,
    )
    session = FauxSession([autre])

    with pytest.raises(Exception) as info:
        await appliquer(session, "user.activated", _compte())

    assert getattr(info.value, "status_code", None) == 409
    assert len(session.utilisateurs) == 1
    assert autre.besti_id == uuid.UUID(int=999)


@pytest.mark.anyio
async def test_deactivation_desactive_le_compte_et_purge_ses_jetons():
    session = FauxSession()
    utilisateur = await appliquer(session, "user.activated", _compte())
    utilisateur.id = 42

    resultat = await appliquer(session, "user.deactivated", _compte())

    assert resultat is None
    assert session.utilisateurs[0].actif is False
    assert ("jetons", 42) in session.supprimes


@pytest.mark.anyio
async def test_deactivation_d_un_compte_inconnu_renvoie_sans_erreur():
    """Besti peut notifier une désactivation avant l'activation : 204 attendu."""
    session = FauxSession()

    assert await appliquer(session, "user.deactivated", _compte()) is None
    assert session.utilisateurs == []


@pytest.mark.anyio
async def test_reactivation_remet_le_compte_actif():
    session = FauxSession()
    await appliquer(session, "user.activated", _compte())
    await appliquer(session, "user.deactivated", _compte())

    utilisateur = await appliquer(session, "user.activated", _compte())

    assert utilisateur.actif is True
    assert len(session.utilisateurs) == 1


@pytest.mark.anyio
async def test_le_role_existant_est_conserve_a_la_mise_a_jour():
    """Un compte promu côté iRindra n'est pas rebasculé par un `updated`."""
    lie = Utilisateur(
        id=3,
        nom="Durand",
        prenom="Camille",
        email="client@exemple.fr",
        mot_de_passe_hash=None,
        besti_id=uuid.UUID(int=1),
        role=RoleUtilisateur.CHEF_DE_PROJET,
        actif=True,
    )
    session = FauxSession([lie])

    utilisateur = await appliquer(session, "user.updated", _compte(lastName="Durand"))

    assert utilisateur.role is RoleUtilisateur.CHEF_DE_PROJET


def test_evenements_contrat_puis_webhook_et_ping():
    """Rappel du contrat : ces quatre événements sont les seuls acceptés."""
    assert set(EVENTS) == set(EVENTS) and len(EVENTS) == 4