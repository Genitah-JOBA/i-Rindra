# tests/test_besti_projets.py
"""Projets Besti en consultation : webhook `project.*`, lecture par le client
connecté et téléchargement des fichiers relayé depuis Besti.

Contrairement aux tests des comptes (fausses sessions), ces tests tournent sur
une vraie base SQLite en mémoire : le remplacement d'un instantané (cahiers,
fichiers et liens réutilisés, ajoutés ou supprimés) dépend du comportement réel
de l'ORM, qu'une fausse session ne reproduirait pas.

Les requêtes du webhook sont fabriquées avec `content=` (corps brut signé),
jamais `json=` : un JSON re-sérialisé n'aurait plus la même signature.
"""
import hashlib
import hmac
import json
import time
import uuid

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.models.besti_projet import (
    BestiCahier,
    BestiFichier,
    BestiLien,
    BestiProjet,
    BestiStatutHistorique,
)
from app.models.client import Client
from app.models.mot_de_passe_reinit import MotDePasseReinit
from app.models.utilisateur import RoleUtilisateur, Utilisateur

SECRET = "secret-de-test-besti"
BESTI_URL = "https://besti.test"

TABLES = [
    Client.__table__,
    Utilisateur.__table__,
    MotDePasseReinit.__table__,
    BestiProjet.__table__,
    BestiCahier.__table__,
    BestiFichier.__table__,
    BestiLien.__table__,
    BestiStatutHistorique.__table__,
]


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _liaison_configuree(monkeypatch):
    monkeypatch.setattr(settings, "BESTI_WEBHOOK_SECRET", SECRET, raising=False)
    monkeypatch.setattr(settings, "BESTI_API_KEY", "cle-de-test", raising=False)
    monkeypatch.setattr(settings, "BESTI_URL", BESTI_URL, raising=False)


@pytest.fixture
async def sessions():
    """Base SQLite en mémoire partagée par toutes les sessions du test."""
    moteur = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with moteur.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=TABLES)
    fabrique = async_sessionmaker(moteur, expire_on_commit=False)
    yield fabrique
    await moteur.dispose()


@pytest.fixture
async def api(sessions):
    from app.main import app

    async def _get_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.pop(get_db, None)


# --- Données ------------------------------------------------------------------

async def _compte(sessions, *, actif=True) -> Utilisateur:
    """Compte client lié à Besti, déjà présent dans iRindra."""
    async with sessions() as db:
        u = Utilisateur(
            nom="Curie",
            prenom="Marie",
            email=f"{uuid.uuid4().hex[:8]}@exemple.fr",
            mot_de_passe_hash=None,
            besti_id=uuid.uuid4(),
            role=RoleUtilisateur.CLIENT,
            actif=actif,
        )
        db.add(u)
        await db.commit()
        return u


def _jeton(utilisateur: Utilisateur, role: str = "client") -> dict:
    jeton = create_access_token(
        {"sub": str(utilisateur.id), "role": role, "email": utilisateur.email, "client_id": None}
    )
    return {"Authorization": f"Bearer {jeton}"}


def _statut(code="soumis", label="Soumis", since="2026-10-12T08:00:00Z"):
    return {"code": code, "label": label, "since": since}


def _fichier(file_id=None, name="brief.pdf"):
    return {
        "fileId": str(file_id or uuid.uuid4()),
        "name": name,
        "mimeType": "application/pdf",
        "sizeBytes": 245760,
        "addedAt": "2026-10-12T08:00:00Z",
    }


def _lien(link_id=None, url="https://www.figma.com/file/abc"):
    return {"linkId": str(link_id or uuid.uuid4()), "url": url, "label": "Maquettes", "provider": "Figma"}


def _cahier(spec_id=None, *, files=None, links=None, title="Cahier des charges v1"):
    return {
        "specificationId": str(spec_id or uuid.uuid4()),
        "title": title,
        "description": None,
        "submittedOn": "2026-10-12",
        "status": {"code": "en_cours", "label": "En cours"},
        "files": files if files is not None else [_fichier()],
        "links": links if links is not None else [_lien()],
    }


def _projet(compte, *, project_id=None, updated="2026-10-14T09:12:00Z", status=None, specs=None, name="Refonte du site vitrine"):
    return {
        "projectId": str(project_id or uuid.uuid4()),
        "bestiId": str(compte.besti_id),
        "name": name,
        "description": "Nouveau site",
        "createdOn": "2026-10-12",
        "desiredDeadline": "2026-12-01",
        "status": status or _statut(),
        "updatedAt": updated,
        "specifications": specs if specs is not None else [_cahier()],
    }


def _entetes(evenement: str, corps: bytes, *, secret: str = SECRET) -> dict:
    ts = str(int(time.time()))
    signature = "sha256=" + hmac.new(
        secret.encode(), ts.encode() + b"." + corps, hashlib.sha256
    ).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Besti-Event": evenement,
        "X-Besti-Delivery": str(uuid.uuid4()),
        "X-Besti-Timestamp": ts,
        "X-Besti-Signature": signature,
    }


async def _envoyer(api, evenement: str, charge, *, corps: bytes | None = None, secret: str = SECRET):
    corps = corps if corps is not None else json.dumps(charge).encode()
    return await api.post(
        "/besti/webhook", content=corps, headers=_entetes(evenement, corps, secret=secret)
    )


async def _compter(sessions, modele) -> int:
    async with sessions() as db:
        return (await db.execute(select(func.count()).select_from(modele))).scalar_one()


async def _lire(sessions, project_id) -> BestiProjet | None:
    async with sessions() as db:
        resultat = await db.execute(
            select(BestiProjet).where(BestiProjet.besti_projet_id == uuid.UUID(str(project_id)))
        )
        return resultat.scalar_one_or_none()


# --- 1. Webhook ---------------------------------------------------------------

@pytest.mark.anyio
async def test_project_created_crée_tout(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte)

    r = await _envoyer(api, "project.created", charge)

    assert r.status_code == 204, r.text
    projet = await _lire(sessions, charge["projectId"])
    assert projet.utilisateur_id == compte.id
    assert projet.nom == "Refonte du site vitrine"
    assert projet.statut_code == "soumis" and projet.statut_libelle == "Soumis"
    assert projet.archive_le is None
    assert len(projet.cahiers) == 1
    assert len(projet.cahiers[0].fichiers) == 1
    assert len(projet.cahiers[0].liens) == 1
    assert [h.code for h in projet.historique] == ["soumis"]


@pytest.mark.anyio
async def test_rejeu_du_même_envoi_ne_duplique_rien(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte)

    for _ in range(2):
        assert (await _envoyer(api, "project.created", charge)).status_code == 204

    assert await _compter(sessions, BestiProjet) == 1
    assert await _compter(sessions, BestiCahier) == 1
    assert await _compter(sessions, BestiFichier) == 1
    assert await _compter(sessions, BestiLien) == 1
    assert await _compter(sessions, BestiStatutHistorique) == 1


@pytest.mark.anyio
async def test_updated_avec_un_cahier_en_moins_le_fait_disparaître(api, sessions):
    compte = await _compte(sessions)
    garde, retire = _cahier(title="Gardé"), _cahier(title="Retiré")
    charge = _projet(compte, specs=[garde, retire])
    await _envoyer(api, "project.created", charge)

    charge |= {"updatedAt": "2026-10-15T09:00:00Z", "specifications": [garde]}
    assert (await _envoyer(api, "project.updated", charge)).status_code == 204

    projet = await _lire(sessions, charge["projectId"])
    assert [c.titre for c in projet.cahiers] == ["Gardé"]
    # Les fichiers et liens du cahier retiré disparaissent avec lui.
    assert await _compter(sessions, BestiFichier) == 1
    assert await _compter(sessions, BestiLien) == 1


@pytest.mark.anyio
async def test_fichier_déplacé_d_un_cahier_à_l_autre(api, sessions):
    """Un même fileId qui change de cahier est réutilisé, pas recréé (sinon
    violation d'unicité dans la transaction)."""
    compte = await _compte(sessions)
    fichier = _fichier()
    a, b = uuid.uuid4(), uuid.uuid4()
    charge = _projet(compte, specs=[_cahier(a, files=[fichier]), _cahier(b, files=[])])
    await _envoyer(api, "project.created", charge)

    charge |= {
        "updatedAt": "2026-10-15T09:00:00Z",
        "specifications": [_cahier(b, files=[fichier])],
    }
    assert (await _envoyer(api, "project.updated", charge)).status_code == 204

    projet = await _lire(sessions, charge["projectId"])
    assert len(projet.cahiers) == 1
    assert [str(f.besti_fichier_id) for f in projet.cahiers[0].fichiers] == [fichier["fileId"]]


@pytest.mark.anyio
async def test_statut_changé_ajoute_une_ligne_identique_n_ajoute_rien(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte)
    await _envoyer(api, "project.created", charge)

    # Même statut, instantané plus récent : aucune ligne d'historique.
    charge |= {"updatedAt": "2026-10-15T09:00:00Z", "name": "Nouveau nom"}
    await _envoyer(api, "project.updated", charge)
    # Statut différent : une ligne.
    charge |= {
        "updatedAt": "2026-10-16T09:00:00Z",
        "status": _statut("estimation_disponible", "Estimation disponible", "2026-10-16T09:00:00Z"),
    }
    await _envoyer(api, "project.updated", charge)

    projet = await _lire(sessions, charge["projectId"])
    assert projet.nom == "Nouveau nom"
    assert [h.code for h in projet.historique] == ["soumis", "estimation_disponible"]
    assert projet.statut_libelle == "Estimation disponible"


@pytest.mark.anyio
async def test_instantané_plus_ancien_ignoré(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte, updated="2026-10-14T09:12:00Z")
    await _envoyer(api, "project.created", charge)

    ancien = charge | {"updatedAt": "2026-10-13T09:00:00Z", "name": "Ancien nom", "specifications": []}
    r = await _envoyer(api, "project.updated", ancien)

    assert r.status_code == 204
    projet = await _lire(sessions, charge["projectId"])
    assert projet.nom == "Refonte du site vitrine"
    assert len(projet.cahiers) == 1


@pytest.mark.anyio
async def test_client_inconnu_renvoie_503_sans_rien_créer(api, sessions):
    inconnu = Utilisateur(besti_id=uuid.uuid4())

    r = await _envoyer(api, "project.created", _projet(inconnu))

    assert r.status_code == 503
    assert await _compter(sessions, BestiProjet) == 0
    assert await _compter(sessions, Utilisateur) == 0, "jamais de compte créé par un projet"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("evenement", "corps"),
    [
        ("project.created", b'{"projectId": "pas-un-uuid"}'),
        ("project.updated", b"{pas du json"),
        ("project.deleted", b'{"projectId": "' + str(uuid.uuid4()).encode() + b'"}'),
    ],
)
async def test_corps_invalide_renvoie_400(api, sessions, evenement, corps):
    r = await _envoyer(api, evenement, None, corps=corps)

    assert r.status_code == 400, "un corps invalide doit répondre 400, jamais 422"


@pytest.mark.anyio
async def test_mauvaise_signature_renvoie_401(api, sessions):
    compte = await _compte(sessions)

    r = await _envoyer(api, "project.created", _projet(compte), secret="faux-secret")

    assert r.status_code == 401
    assert await _compter(sessions, BestiProjet) == 0


@pytest.mark.anyio
async def test_deleted_archive_puis_updated_désarchive(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte)
    await _envoyer(api, "project.created", charge)

    suppression = {
        "projectId": charge["projectId"],
        "bestiId": charge["bestiId"],
        "deletedAt": "2026-10-15T10:00:00Z",
    }
    assert (await _envoyer(api, "project.deleted", suppression)).status_code == 204
    projet = await _lire(sessions, charge["projectId"])
    assert projet.archive_le is not None
    assert projet.motif_archivage == "supprime_besti"
    assert await _compter(sessions, BestiCahier) == 1, "archivé, jamais effacé"

    # Un instantané antérieur à la suppression, arrivé en retard : ignoré.
    await _envoyer(api, "project.updated", charge | {"updatedAt": "2026-10-15T09:00:00Z"})
    assert (await _lire(sessions, charge["projectId"])).archive_le is not None

    await _envoyer(api, "project.updated", charge | {"updatedAt": "2026-10-16T09:00:00Z"})
    projet = await _lire(sessions, charge["projectId"])
    assert projet.archive_le is None and projet.motif_archivage is None


@pytest.mark.anyio
async def test_deleted_d_un_projet_inconnu_renvoie_204(api, sessions):
    compte = await _compte(sessions)
    suppression = {
        "projectId": str(uuid.uuid4()),
        "bestiId": str(compte.besti_id),
        "deletedAt": "2026-10-15T10:00:00Z",
    }

    assert (await _envoyer(api, "project.deleted", suppression)).status_code == 204


@pytest.mark.anyio
async def test_deleted_d_un_client_inconnu_renvoie_503(api, sessions):
    suppression = {
        "projectId": str(uuid.uuid4()),
        "bestiId": str(uuid.uuid4()),
        "deletedAt": "2026-10-15T10:00:00Z",
    }

    assert (await _envoyer(api, "project.deleted", suppression)).status_code == 503


def _compte_besti(compte, **champs):
    return {
        "bestiId": str(compte.besti_id),
        "email": compte.email,
        "firstName": "Marie",
        "lastName": "Curie",
        "companyName": "SCI Curie",
        "status": "Actif",
    } | champs


@pytest.mark.anyio
async def test_désactivation_archive_et_réactivation_désarchive(api, sessions):
    compte = await _compte(sessions)
    actif, supprime = _projet(compte), _projet(compte)
    await _envoyer(api, "project.created", actif)
    await _envoyer(api, "project.created", supprime)
    await _envoyer(api, "project.deleted", {
        "projectId": supprime["projectId"],
        "bestiId": supprime["bestiId"],
        "deletedAt": "2026-10-15T10:00:00Z",
    })

    assert (await _envoyer(api, "user.deactivated", _compte_besti(compte))).status_code == 204
    projet = await _lire(sessions, actif["projectId"])
    assert projet.archive_le is not None
    assert projet.motif_archivage == "compte_desactive"
    assert (await _lire(sessions, supprime["projectId"])).motif_archivage == "supprime_besti"

    assert (await _envoyer(api, "user.activated", _compte_besti(compte))).status_code == 204
    assert (await _lire(sessions, actif["projectId"])).archive_le is None
    # Un projet supprimé dans Besti reste archivé après la réactivation.
    assert (await _lire(sessions, supprime["projectId"])).motif_archivage == "supprime_besti"


@pytest.mark.anyio
async def test_projet_reçu_pour_un_compte_désactivé_reste_archivé(api, sessions):
    compte = await _compte(sessions, actif=False)
    charge = _projet(compte)

    assert (await _envoyer(api, "project.created", charge)).status_code == 204
    assert (await _lire(sessions, charge["projectId"])).motif_archivage == "compte_desactive"


@pytest.mark.anyio
async def test_code_de_statut_inconnu_accepté(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte, status=_statut("statut_futur_inedit", "Statut inédit"))

    assert (await _envoyer(api, "project.created", charge)).status_code == 204
    projet = await _lire(sessions, charge["projectId"])
    assert projet.statut_code == "statut_futur_inedit"
    assert projet.statut_libelle == "Statut inédit"


@pytest.mark.anyio
async def test_lien_non_http_ignoré(api, sessions):
    """Un `javascript:` affiché comme lien s'exécuterait au clic du client."""
    compte = await _compte(sessions)
    charge = _projet(compte, specs=[_cahier(links=[_lien(url="javascript:alert(1)"), _lien()])])

    assert (await _envoyer(api, "project.created", charge)).status_code == 204
    projet = await _lire(sessions, charge["projectId"])
    assert [l.url for l in projet.cahiers[0].liens] == ["https://www.figma.com/file/abc"]


@pytest.mark.anyio
async def test_ping_et_comptes_inchangés(api, sessions):
    assert (await _envoyer(api, "ping", None, corps=b"{}")).status_code == 204
    assert (await _envoyer(api, "project.inconnu", None, corps=b"{}")).status_code == 400


# --- 2. Lecture -----------------------------------------------------------------

@pytest.mark.anyio
async def test_le_client_ne_voit_que_ses_projets(api, sessions):
    moi, autre = await _compte(sessions), await _compte(sessions)
    mien, sien = _projet(moi, name="Le mien"), _projet(autre, name="Le sien")
    await _envoyer(api, "project.created", mien)
    await _envoyer(api, "project.created", sien)

    r = await api.get("/client/besti/projets", headers=_jeton(moi))

    assert r.status_code == 200
    assert [p["nom"] for p in r.json()] == ["Le mien"]
    statut = r.json()[0]["statut"]
    assert (statut["code"], statut["libelle"]) == ("soumis", "Soumis")
    # SQLite rend les dates sans fuseau (PostgreSQL le conserve).
    assert statut["depuis"].startswith("2026-10-12T08:00:00")


@pytest.mark.anyio
async def test_projets_archivés_listés_à_part(api, sessions):
    moi = await _compte(sessions)
    actif, supprime = _projet(moi, name="Actif"), _projet(moi, name="Supprimé")
    await _envoyer(api, "project.created", actif)
    await _envoyer(api, "project.created", supprime)
    await _envoyer(api, "project.deleted", {
        "projectId": supprime["projectId"],
        "bestiId": supprime["bestiId"],
        "deletedAt": "2026-10-15T10:00:00Z",
    })

    actifs = (await api.get("/client/besti/projets", headers=_jeton(moi))).json()
    archives = (await api.get("/client/besti/projets?archives=true", headers=_jeton(moi))).json()

    assert [p["nom"] for p in actifs] == ["Actif"]
    assert [p["nom"] for p in archives] == ["Supprimé"]
    assert archives[0]["motif_archivage"] == "supprime_besti"
    assert archives[0]["archive_le"].startswith("2026-10-15T10:00:00")


@pytest.mark.anyio
async def test_détail_avec_historique_et_cahiers(api, sessions):
    moi = await _compte(sessions)
    charge = _projet(moi)
    await _envoyer(api, "project.created", charge)
    await _envoyer(api, "project.updated", charge | {
        "updatedAt": "2026-10-16T09:00:00Z",
        "status": _statut("accepte", "Accepté", "2026-10-16T09:00:00Z"),
    })

    r = await api.get(f"/client/besti/projets/{charge['projectId']}", headers=_jeton(moi))

    assert r.status_code == 200
    detail = r.json()
    assert [h["code"] for h in detail["historique"]] == ["soumis", "accepte"]
    cahier = detail["cahiers"][0]
    assert cahier["statut"] == {"code": "en_cours", "libelle": "En cours", "depuis": None}
    assert cahier["fichiers"][0]["nom"] == "brief.pdf"
    assert cahier["liens"][0]["url"] == "https://www.figma.com/file/abc"
    # Aucun montant, aucune adresse de fichier chez Besti.
    assert "besti.test" not in r.text


@pytest.mark.anyio
async def test_projet_d_un_autre_client_renvoie_404(api, sessions):
    moi, autre = await _compte(sessions), await _compte(sessions)
    sien = _projet(autre)
    await _envoyer(api, "project.created", sien)

    r = await api.get(f"/client/besti/projets/{sien['projectId']}", headers=_jeton(moi))

    assert r.status_code == 404


@pytest.mark.anyio
async def test_lecture_réservée_aux_clients(api, sessions):
    moi = await _compte(sessions)

    r = await api.get("/client/besti/projets", headers=_jeton(moi, role="direction"))

    assert r.status_code == 403


def test_aucune_route_d_écriture_exposée():
    from app.main import app

    routes = [r for r in app.routes if getattr(r, "path", "").startswith("/client/besti")]
    assert routes, "les routes de lecture doivent être montées"
    for route in routes:
        assert route.methods == {"GET"}, f"{route.path} expose {route.methods}"


# --- 3. Fichiers ------------------------------------------------------------------

def _faux_besti(monkeypatch, gestionnaire):
    """Remplace le transport httpx utilisé pour joindre Besti."""
    transport = httpx.MockTransport(gestionnaire)
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw))


async def _projet_avec_fichier(api, sessions):
    moi = await _compte(sessions)
    fichier = _fichier(name="brief.pdf")
    await _envoyer(api, "project.created", _projet(moi, specs=[_cahier(files=[fichier])]))
    return moi, fichier["fileId"]


@pytest.mark.anyio
async def test_téléchargement_relayé_depuis_besti(api, sessions, monkeypatch):
    moi, file_id = await _projet_avec_fichier(api, sessions)
    vus = []

    def _besti(requete: httpx.Request):
        vus.append(requete)
        return httpx.Response(
            200,
            content=b"%PDF-1.7 contenu",
            headers={
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="brief.pdf"',
            },
        )

    _faux_besti(monkeypatch, _besti)
    r = await api.get(f"/client/besti/fichiers/{file_id}", headers=_jeton(moi))

    assert r.status_code == 200
    assert r.content == b"%PDF-1.7 contenu"
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"] == 'attachment; filename="brief.pdf"'
    assert str(vus[0].url) == f"{BESTI_URL}/api/integrations/files/{file_id}"
    assert vus[0].headers["X-Api-Key"] == "cle-de-test"


@pytest.mark.anyio
async def test_fichier_d_un_autre_client_404_sans_appeler_besti(api, sessions, monkeypatch):
    _, file_id = await _projet_avec_fichier(api, sessions)
    intrus = await _compte(sessions)

    def _jamais(requete):
        raise AssertionError("Besti ne doit pas être interrogé")

    _faux_besti(monkeypatch, _jamais)
    r = await api.get(f"/client/besti/fichiers/{file_id}", headers=_jeton(intrus))

    assert r.status_code == 404


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("code_besti", "attendu", "message"),
    [
        (404, 404, "Ce fichier n'est plus disponible sur Besti"),
        (401, 503, "Téléchargement momentanément indisponible, réessayez plus tard"),
        (500, 503, "Téléchargement momentanément indisponible, réessayez plus tard"),
    ],
)
async def test_erreurs_besti_au_téléchargement(api, sessions, monkeypatch, code_besti, attendu, message):
    moi, file_id = await _projet_avec_fichier(api, sessions)
    _faux_besti(monkeypatch, lambda requete: httpx.Response(code_besti))

    r = await api.get(f"/client/besti/fichiers/{file_id}", headers=_jeton(moi))

    assert r.status_code == attendu
    assert r.json()["detail"] == message


@pytest.mark.anyio
async def test_besti_injoignable_au_téléchargement(api, sessions, monkeypatch):
    moi, file_id = await _projet_avec_fichier(api, sessions)

    def _panne(requete):
        raise httpx.ConnectError("injoignable", request=requete)

    _faux_besti(monkeypatch, _panne)
    r = await api.get(f"/client/besti/fichiers/{file_id}", headers=_jeton(moi))

    assert r.status_code == 503


@pytest.mark.anyio
async def test_téléchargement_sans_clé_configurée(api, sessions, monkeypatch):
    moi, file_id = await _projet_avec_fichier(api, sessions)
    monkeypatch.setattr(settings, "BESTI_API_KEY", "", raising=False)

    r = await api.get(f"/client/besti/fichiers/{file_id}", headers=_jeton(moi))

    assert r.status_code == 503
