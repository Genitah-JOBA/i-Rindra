# tests/test_besti_projets.py
"""Projets Besti : webhook `project.*` et import auto en projet suivi.

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

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.models.besti_projet import (
    BestiCahier,
    BestiFichier,
    BestiLien,
    BestiProjet,
    BestiStatutHistorique,
)
from app.models.client import Client
from app.models.mot_de_passe_reinit import MotDePasseReinit
from app.models.facture import Facture
from app.models.projet import Projet, ProjetMembre
from app.models.suggestion_devis import SuggestionDevis
from app.models.utilisateur import RoleUtilisateur, Utilisateur

SECRET = "secret-de-test-besti"
BESTI_URL = "https://besti.test"

TABLES = [
    Client.__table__,
    Utilisateur.__table__,
    MotDePasseReinit.__table__,
    Projet.__table__,
    ProjetMembre.__table__,
    Facture.__table__,
    SuggestionDevis.__table__,
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

async def _compte(sessions, *, actif=True, role=RoleUtilisateur.CLIENT) -> Utilisateur:
    """Compte lié à Besti, déjà présent dans iRindra (client par défaut)."""
    async with sessions() as db:
        u = Utilisateur(
            nom="Curie",
            prenom="Marie",
            email=f"{uuid.uuid4().hex[:8]}@exemple.fr",
            mot_de_passe_hash=None,
            besti_id=uuid.uuid4(),
            role=role,
            actif=actif,
        )
        db.add(u)
        await db.commit()
        return u


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
    """Client facturé : la désactivation Besti ne peut pas l'effacer, elle archive."""
    compte = await _compte(sessions)
    actif, supprime = _projet(compte), _projet(compte)
    await _envoyer(api, "project.created", actif)
    await _envoyer(api, "project.created", supprime)
    await _facturer(sessions, compte.id)
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


# --- 2. Import auto en projet suivi --------------------------------------------

async def _lire_suivi(sessions, project_id) -> Projet | None:
    async with sessions() as db:
        resultat = await db.execute(
            select(Projet).where(Projet.besti_projet_id == uuid.UUID(str(project_id)))
        )
        return resultat.scalar_one_or_none()


@pytest.mark.anyio
async def test_import_cree_projet_suivi_champs_communs(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte)

    assert (await _envoyer(api, "project.created", charge)).status_code == 204

    suivi = await _lire_suivi(sessions, charge["projectId"])
    assert suivi is not None
    assert suivi.nom == "Refonte du site vitrine"
    assert suivi.description == "Nouveau site"
    assert str(suivi.date_debut) == "2026-10-12"
    assert str(suivi.date_fin_prevue) == "2026-12-01"
    assert suivi.archive is False
    assert suivi.statut_sante.value == "vert"
    assert suivi.avancement_pct == 0
    assert suivi.responsable_id is None
    # Client repris de la fiche du compte (créée à la volée ici).
    assert suivi.client_id is not None
    async with sessions() as db:
        fiche = await db.get(Client, suivi.client_id)
        assert fiche is not None
        assert fiche.email == compte.email


@pytest.mark.anyio
async def test_import_rejeu_ne_duplique_pas_le_suivi(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte)

    for _ in range(2):
        assert (await _envoyer(api, "project.created", charge)).status_code == 204

    assert await _compter(sessions, Projet) == 1


@pytest.mark.anyio
async def test_import_updated_met_a_jour_sans_ecraser_le_pilotage(api, sessions):
    from app.models.projet import StatutSante

    compte = await _compte(sessions)
    charge = _projet(compte)
    await _envoyer(api, "project.created", charge)

    # Pilotage iRindra : santé et avancement changés par la gestion.
    async with sessions() as db:
        resultat = await db.execute(
            select(Projet).where(Projet.besti_projet_id == uuid.UUID(charge["projectId"]))
        )
        suivi = resultat.scalar_one()
        suivi.statut_sante = StatutSante.ORANGE
        suivi.avancement_pct = 42
        await db.commit()

    charge |= {
        "updatedAt": "2026-10-16T09:00:00Z",
        "name": "Nouveau nom",
        "description": "Nouvelle description",
        "desiredDeadline": "2027-01-15",
    }
    assert (await _envoyer(api, "project.updated", charge)).status_code == 204

    suivi = await _lire_suivi(sessions, charge["projectId"])
    assert suivi.nom == "Nouveau nom"
    assert suivi.description == "Nouvelle description"
    assert str(suivi.date_fin_prevue) == "2027-01-15"
    assert suivi.statut_sante.value == "orange"
    assert suivi.avancement_pct == 42
    assert await _compter(sessions, Projet) == 1


@pytest.mark.anyio
async def test_import_deleted_archive_puis_updated_desarchive_le_suivi(api, sessions):
    compte = await _compte(sessions)
    charge = _projet(compte)
    await _envoyer(api, "project.created", charge)

    suppression = {
        "projectId": charge["projectId"],
        "bestiId": charge["bestiId"],
        "deletedAt": "2026-10-15T10:00:00Z",
    }
    assert (await _envoyer(api, "project.deleted", suppression)).status_code == 204
    assert (await _lire_suivi(sessions, charge["projectId"])).archive is True

    await _envoyer(api, "project.updated", charge | {"updatedAt": "2026-10-16T09:00:00Z"})
    assert (await _lire_suivi(sessions, charge["projectId"])).archive is False


@pytest.mark.anyio
async def test_import_desactivation_reactivation_archive_le_suivi(api, sessions):
    """Client facturé : projets suivis archivés puis désarchivés."""
    compte = await _compte(sessions)
    actif, supprime = _projet(compte), _projet(compte)
    await _envoyer(api, "project.created", actif)
    await _envoyer(api, "project.created", supprime)
    await _facturer(sessions, compte.id)
    await _envoyer(api, "project.deleted", {
        "projectId": supprime["projectId"],
        "bestiId": supprime["bestiId"],
        "deletedAt": "2026-10-15T10:00:00Z",
    })

    assert (await _envoyer(api, "user.deactivated", _compte_besti(compte))).status_code == 204
    assert (await _lire_suivi(sessions, actif["projectId"])).archive is True
    assert (await _lire_suivi(sessions, supprime["projectId"])).archive is True

    assert (await _envoyer(api, "user.activated", _compte_besti(compte))).status_code == 204
    assert (await _lire_suivi(sessions, actif["projectId"])).archive is False
    # Supprimé dans Besti : reste archivé des deux côtés.
    assert (await _lire_suivi(sessions, supprime["projectId"])).archive is True


# --- 3. Affectations, pays, clients retirés -------------------------------------

async def _interne(sessions, email, role=RoleUtilisateur.EQUIPE, actif=True) -> Utilisateur:
    async with sessions() as db:
        u = Utilisateur(nom="Rabe", prenom="Ana", email=email, mot_de_passe_hash="x", role=role, actif=actif)
        db.add(u)
        await db.commit()
        return u


async def _suivi_et_membres(sessions, project_id):
    async with sessions() as db:
        suivi = (await db.execute(
            select(Projet).where(Projet.besti_projet_id == uuid.UUID(str(project_id)))
        )).scalar_one()
        membres = (await db.execute(
            select(ProjetMembre).where(ProjetMembre.projet_id == suivi.id)
        )).scalars().all()
        return suivi, {m.utilisateur_id: m for m in membres}


@pytest.mark.anyio
async def test_affectations_besti_alimentent_l_equipe(api, sessions):
    compte = await _compte(sessions)
    chef = await _interne(sessions, "chef@bienfe.mg", RoleUtilisateur.CHEF_DE_PROJET)
    dev = await _interne(sessions, "dev@bienfe.mg")
    charge = _projet(compte) | {"team": [
        {"email": "Chef@Bienfe.mg"}, {"email": "dev@bienfe.mg"}, {"email": "inconnu@bienfe.mg"},
    ]}

    assert (await _envoyer(api, "project.created", charge)).status_code == 204
    suivi, membres = await _suivi_et_membres(sessions, charge["projectId"])
    assert set(membres) == {chef.id, dev.id}
    assert suivi.responsable_id == chef.id               # premier affecté
    assert membres[chef.id].role_dans_projet == "responsable"
    assert all(m.ajoute_par_besti for m in membres.values())

    # Besti retire le développeur : il quitte l'équipe ; un membre ajouté à la main reste
    manuel = await _interne(sessions, "manuel@bienfe.mg")
    async with sessions() as db:
        db.add(ProjetMembre(projet_id=suivi.id, utilisateur_id=manuel.id, role_dans_projet="membre"))
        await db.commit()
    maj = charge | {"updatedAt": "2026-10-15T09:00:00Z", "team": [{"email": "chef@bienfe.mg"}]}
    assert (await _envoyer(api, "project.updated", maj)).status_code == 204
    _, membres = await _suivi_et_membres(sessions, charge["projectId"])
    assert set(membres) == {chef.id, manuel.id}


@pytest.mark.anyio
async def test_sans_champ_team_l_equipe_n_est_pas_touchee(api, sessions):
    compte = await _compte(sessions)
    await _interne(sessions, "chef@bienfe.mg", RoleUtilisateur.CHEF_DE_PROJET)
    charge = _projet(compte) | {"team": [{"email": "chef@bienfe.mg"}]}
    await _envoyer(api, "project.created", charge)
    sans = {k: v for k, v in charge.items() if k != "team"} | {"updatedAt": "2026-10-15T09:00:00Z"}
    await _envoyer(api, "project.updated", sans)
    _, membres = await _suivi_et_membres(sessions, charge["projectId"])
    assert len(membres) == 1


@pytest.mark.anyio
async def test_un_client_ou_un_compte_inactif_n_est_jamais_affecte(api, sessions):
    compte = await _compte(sessions)
    await _interne(sessions, "client@ex.fr", RoleUtilisateur.CLIENT)
    await _interne(sessions, "parti@bienfe.mg", actif=False)
    charge = _projet(compte) | {"team": [{"email": "client@ex.fr"}, {"email": "parti@bienfe.mg"}]}
    await _envoyer(api, "project.created", charge)
    suivi, membres = await _suivi_et_membres(sessions, charge["projectId"])
    assert membres == {} and suivi.responsable_id is None


async def _devise(sessions, compte_id):
    async with sessions() as db:
        u = await db.get(Utilisateur, compte_id)
        return (await db.get(Client, u.client_id)).devise


@pytest.mark.anyio
async def test_pays_besti_classe_le_client(api, sessions):
    compte = await _compte(sessions)
    await _envoyer(api, "user.updated", _compte_besti(compte))
    assert await _devise(sessions, compte.id) == "Ar"            # pas de pays : défaut national
    await _envoyer(api, "user.updated", _compte_besti(compte, countryCode="FR", countryName="France"))
    assert await _devise(sessions, compte.id) == "EUR"
    await _envoyer(api, "user.updated", _compte_besti(compte))   # pays absent : inchangé
    assert await _devise(sessions, compte.id) == "EUR"
    await _envoyer(api, "user.updated", _compte_besti(compte, countryName="Madagascar"))
    assert await _devise(sessions, compte.id) == "Ar"


@pytest.mark.anyio
async def test_client_supprime_dans_besti_masque_de_la_liste(api, sessions):
    from app.main import app
    from app.routers.auth import get_current_user_role

    garde, suppr, facture = await _compte(sessions), await _compte(sessions), await _compte(sessions)
    for c in (garde, suppr, facture):
        await _envoyer(api, "user.activated", _compte_besti(c))
    await _facturer(sessions, facture.id)
    await _envoyer(api, "user.deactivated", _compte_besti(suppr))     # effacé
    await _envoyer(api, "user.deactivated", _compte_besti(facture))   # gardé, masqué

    app.dependency_overrides[get_current_user_role] = lambda: "direction"
    try:
        tous = (await api.get("/clients/")).json()
        actifs = (await api.get("/clients/", params={"actifs_seulement": True})).json()
    finally:
        app.dependency_overrides.pop(get_current_user_role, None)
    assert len(tous) == 2 and len(actifs) == 1
    async with sessions() as db:
        assert actifs[0]["id"] == (await db.get(Utilisateur, garde.id)).client_id


@pytest.mark.parametrize("code, nom, attendu", [
    ("MG", None, True), ("MDG", None, True), ("MGA", None, True), ("mg", None, True),
    ("fr-MG", None, True), ("FR", None, False), ("fr-FR", None, False), ("USA", None, False),
    (None, "Madagascar", True), ("XX", "République de Madagascar", True), (None, "France", False),
    (None, None, None), ("", "", None),
])
def test_codes_pays_besti(code, nom, attendu):
    from app.besti.service import est_pays_national
    assert est_pays_national(code, nom) is attendu



# --- 4. Suppression d'un client dans Besti (user.deleted) ----------------------

async def _etat(sessions, compte_id, client_id):
    async with sessions() as db:
        return (
            await db.get(Utilisateur, compte_id),
            await db.get(Client, client_id),
            (await db.execute(select(func.count()).select_from(Projet).where(Projet.client_id == client_id))).scalar_one(),
        )


async def _client_avec_projet(api, sessions):
    compte = await _compte(sessions)
    await _envoyer(api, "user.activated", _compte_besti(compte))
    await _envoyer(api, "project.created", _projet(compte))
    async with sessions() as db:
        client_id = (await db.get(Utilisateur, compte.id)).client_id
    return compte, client_id


@pytest.mark.anyio
@pytest.mark.parametrize("evenement", ["user.deactivated", "user.deleted"])
async def test_client_retire_de_besti_efface_compte_fiche_et_projets(api, sessions, evenement):
    compte, client_id = await _client_avec_projet(api, sessions)
    assert (await _etat(sessions, compte.id, client_id))[2] == 1

    assert (await _envoyer(api, evenement, _compte_besti(compte))).status_code == 204
    assert await _etat(sessions, compte.id, client_id) == (None, None, 0)
    # rejeu : compte déjà parti, rien à faire
    assert (await _envoyer(api, evenement, _compte_besti(compte))).status_code == 204


@pytest.mark.anyio
async def test_user_deleted_client_facture_seulement_desactive(api, sessions):
    from datetime import date
    from decimal import Decimal

    compte, client_id = await _client_avec_projet(api, sessions)
    async with sessions() as db:
        db.add(Facture(numero="F-2026-0001", client_id=client_id, montant_ht=Decimal("100"),
                       taux_tva=Decimal("20"), montant_ttc=Decimal("120"), date_emission=date.today()))
        await db.commit()

    assert (await _envoyer(api, "user.deleted", _compte_besti(compte))).status_code == 204
    u, fiche, nb = await _etat(sessions, compte.id, client_id)
    assert u is not None and u.actif is False and fiche is not None and nb == 1


@pytest.mark.anyio
async def test_suppression_manuelle_d_un_client(api, sessions):
    from app.main import app
    from app.routers.auth import get_current_user_role

    compte, client_id = await _client_avec_projet(api, sessions)
    app.dependency_overrides[get_current_user_role] = lambda: "equipe"
    try:
        assert (await api.delete(f"/clients/{client_id}")).status_code == 403
        app.dependency_overrides[get_current_user_role] = lambda: "direction"
        assert (await api.delete(f"/clients/{client_id}")).status_code == 204
        assert (await api.delete(f"/clients/{client_id}")).status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user_role, None)
    assert await _etat(sessions, compte.id, client_id) == (None, None, 0)


async def _facturer(sessions, compte_id):
    """Ajoute une facture à la fiche client du compte (qui ne peut alors plus être effacée)."""
    from datetime import date
    from decimal import Decimal

    async with sessions() as db:
        client_id = (await db.get(Utilisateur, compte_id)).client_id
        db.add(Facture(numero=f"F-{uuid.uuid4().hex[:8]}", client_id=client_id, montant_ht=Decimal("100"),
                       taux_tva=Decimal("20"), montant_ttc=Decimal("120"), date_emission=date.today()))
        await db.commit()


@pytest.mark.anyio
async def test_client_recree_dans_besti_reprend_l_ancien_compte_desactive(api, sessions):
    """Supprimé puis recréé dans Besti (nouvel identifiant, même email) : pas de 409."""
    ancien = await _compte(sessions, actif=False)
    nouveau_id = uuid.uuid4()
    charge = _compte_besti(ancien) | {"bestiId": str(nouveau_id)}

    assert (await _envoyer(api, "user.activated", charge)).status_code == 204
    async with sessions() as db:
        comptes = (await db.execute(select(Utilisateur))).scalars().all()
    assert len(comptes) == 1
    assert comptes[0].besti_id == nouveau_id and comptes[0].actif is True


@pytest.mark.anyio
async def test_compte_besti_actif_de_meme_email_reste_en_conflit(api, sessions):
    actif = await _compte(sessions)
    charge = _compte_besti(actif) | {"bestiId": str(uuid.uuid4())}
    assert (await _envoyer(api, "user.activated", charge)).status_code == 409
