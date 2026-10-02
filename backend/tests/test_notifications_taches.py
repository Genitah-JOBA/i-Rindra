# tests/test_notifications_taches.py
"""
Tests des notifications « tâche en retard » et « tâche supprimée ».

Deux niveaux :
  1. Fonctions pures : la règle métier du retard (échéance dépassée ET tâche non
     terminée), le décompte des jours et le libellé affiché.
  2. Service : destinataires (direction, DRH, chef de projet, équipe, client du
     projet), liens adaptés au rôle, anti-doublon et réarmement.

Aucune base : une fausse session reconnaît chaque requête par son SQL, comme
dans test_reinitialisation_mdp.py.
"""
import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

from app.services import notifications as notif
from app.models.tache import StatutTache


# ============================================================
# 1. La règle métier du retard (fonctions pures)
# ============================================================

def _tache(**kwargs):
    params = dict(
        id=10,
        projet_id=1,
        titre="Intégration",
        statut=StatutTache.EN_COURS,
        echeance=date.today() - timedelta(days=3),
        responsable_id=2,
        retard_notifie_le=None,
    )
    params.update(kwargs)
    return SimpleNamespace(**params)


def test_tache_en_retard_quand_echeance_depassee_et_non_terminee():
    assert notif.tache_en_retard(_tache()) is True


def test_tache_terminee_jamais_en_retard():
    """Une tâche livrée en retard n'est plus un retard : on ne ré-alerte pas."""
    assert notif.tache_en_retard(_tache(statut=StatutTache.TERMINE)) is False


def test_tache_sans_echeance_jamais_en_retard():
    assert notif.tache_en_retard(_tache(echeance=None)) is False


def test_tache_echeance_aujoudhui_pas_encore_en_retard():
    """L'échéance du jour n'est pas dépassée : l'alerte part le lendemain."""
    assert notif.tache_en_retard(_tache(echeance=date.today())) is False


def test_tache_echeance_future_pas_en_retard():
    assert notif.tache_en_retard(_tache(echeance=date.today() + timedelta(days=5))) is False


def test_jours_de_retard_compte_les_jours_ecretes():
    assert notif.jours_de_retard(_tache(echeance=date.today() - timedelta(days=4))) == 4


def test_jours_de_retard_zero_si_pas_en_retard():
    assert notif.jours_de_retard(_tache(statut=StatutTache.TERMINE)) == 0


def test_message_retard_annonce_le_nombre_de_jours():
    message = notif.message_retard(_tache(echeance=date.today() - timedelta(days=6)))
    assert "Intégration" in message
    assert "6 jours" in message


def test_message_retard_evite_le_phraseur_banal_a_un_jour():
    """« en retard de 1 jours » serait illisible."""
    message = notif.message_retard(_tache(echeance=date.today() - timedelta(days=1)))
    assert "1 jours" not in message
    assert "Intégration" in message


# ============================================================
# 2. La fausse session
# ============================================================

class ResultatFaux:
    """Résultat de ligne : `.all()` donne des tuples (sélection de colonnes)."""

    def __init__(self, lignes=None, valeur=None):
        self._lignes = list(lignes or [])
        self._valeur = valeur

    def all(self):
        return self._lignes

    def scalars(self):
        return self

    def scalar_one_or_none(self):
        return self._valeur

    def scalar(self):
        return self._valeur


class _RequeteEntites:
    """select(Entité) : `.scalars().all()` rend les objets."""

    def __init__(self, objets):
        self._objets = list(objets)

    def scalars(self):
        return self

    def all(self):
        return self._objets


class _RequeteProjet:
    """
    select(Projet) a deux usages distincts :

    - projet précis (`.scalar_one_or_none()`) : renvoie l'objet ou None ;
    - projets actifs du scan (`.scalars().all()`) : ne renvoie que ceux dont
      `archive` est False, afin de tester le cas « projet archivé ».
    """

    def __init__(self, projet):
        self._projet = projet

    def scalar_one_or_none(self):
        return self._projet

    def scalars(self):
        return self

    def all(self):
        if self._projet is None or self._projet.archive:
            return []
        return [self._projet]


class FauxSession:
    """Répond à chaque requête selon son SQL, sans base de données."""

    def __init__(self, gestion=(1,), clients=(50,), membres=(20,), chef=None,
                 projet=None, taches=()):
        self.gestion = list(gestion)
        self.clients = list(clients)
        self.membres = list(membres)
        self.projet = (
            projet
            if projet is not None
            else SimpleNamespace(id=1, client_id=50, responsable_id=chef, archive=False)
        )
        self.taches = list(taches)
        self.ajoutes = []
        self.updates = []
        self.commits = 0

    async def execute(self, requete):
        sql = str(requete)
        if "UPDATE tache" in sql:
            self.updates.append(sql)
            return ResultatFaux()
        if "FROM tache" in sql:
            # select(Tache) -> .scalars() rend des objets Tache
            return _RequeteEntites(self.taches)
        if "FROM projet_membre" in sql:
            return ResultatFaux([(i,) for i in self.membres])
        if "FROM utilisateur" in sql and "role IN" in sql:
            return ResultatFaux([(i,) for i in self.gestion])
        if "FROM utilisateur" in sql:
            return ResultatFaux([(i,) for i in self.clients])
        if "FROM projet" in sql:
            # select(Projet) : sert à la fois en .scalar_one_or_none() (un
            # projet précis) et en .scalars() (les projets actifs du scan).
            return _RequeteProjet(self.projet)
        return ResultatFaux()

    def add(self, objet):
        self.ajoutes.append(objet)

    async def commit(self):
        self.commits += 1

    def par_type(self, type_notif):
        return [n for n in self.ajoutes if n.type == type_notif]

    def par_destinataire(self, uid, type_notif):
        return [
            n for n in self.ajoutes
            if n.destinataire_id == uid and n.type == type_notif
        ]


# ============================================================
# 3. Les destinataires de l'alerte de retard
# ============================================================

def test_alerte_retard_notifie_direction_chef_projet_equipe_et_client():
    db = FauxSession(gestion=[1], clients=[50], membres=[20], chef=30)
    tache = _tache()

    asyncio.run(notif.signaler_retard_tache(db, tache))

    # Direction/DRH (1), chef de projet (30), membre (20) : lien interne.
    for uid in (1, 30, 20):
        notifs = db.par_destinataire(uid, "tache_retard")
        assert len(notifs) == 1, f"l'utilisateur {uid} doit être alerté"
        assert notifs[0].lien == "/taches?projet=1"
        assert notifs[0].message == "Tâche « Intégration » en retard de 3 jours"

    # Le client reçoit la même alerte, mais vers son propre espace : la route
    # /taches n'existe pas pour le rôle « client » (cf. App.jsx).
    notifs_client = db.par_destinataire(50, "tache_retard")
    assert len(notifs_client) == 1
    assert notifs_client[0].lien == "/mon-projet"


def test_alerte_retard_exclut_lauteur_de_laction():
    """Le chef de projet qui vient de voir l'échéance passer n'est pas alerté."""
    db = FauxSession(gestion=[1], clients=[50], membres=[20], chef=30)

    asyncio.run(notif.signaler_retard_tache(db, _tache(), auteur_id=30))

    assert db.par_destinataire(30, "tache_retard") == []
    assert len(db.par_destinataire(1, "tache_retard")) == 1


def test_alerte_retard_pose_le_marqueur_anti_doublon():
    db = FauxSession()
    tache = _tache()

    asyncio.run(notif.signaler_retard_tache(db, tache))

    assert tache.retard_notifie_le is not None


def test_alerte_retard_ne_duplique_pas_un_destinataire_present_deux_fois():
    """Le chef de projet est aussi membre du projet : une seule notification."""
    db = FauxSession(gestion=[1], clients=[50], membres=[30], chef=30)

    asyncio.run(notif.signaler_retard_tache(db, _tache()))

    assert len(db.par_destinataire(30, "tache_retard")) == 1


# ============================================================
# 4. La notification de suppression
# ============================================================

def test_suppression_notifie_direction_chef_projet_et_client():
    db = FauxSession(gestion=[1], clients=[50], membres=[20], chef=30)

    asyncio.run(
        notif.signaler_suppression_tache(db, "Intégration", 1, auteur_id=30)
    )

    for uid in (1, 20):
        assert len(db.par_destinataire(uid, "tache_supprimee")) == 1
    assert db.par_destinataire(30, "tache_supprimee") == []  # auteur

    notif_client = db.par_destinataire(50, "tache_supprimee")
    assert len(notif_client) == 1
    assert notif_client[0].lien == "/mon-projet"
    assert "Intégration" in notif_client[0].message
    assert "supprimée" in notif_client[0].message


def test_suppression_renseigne_le_lien_interne():
    db = FauxSession(gestion=[1])

    asyncio.run(notif.signaler_suppression_tache(db, "Recette", 7, auteur_id=None))

    assert db.ajoutes[0].lien == "/taches?projet=7"


# ============================================================
# 5. Le scan : anti-doublon, réarmement, projets archivés
# ============================================================

def test_scan_signale_les_taches_en_retard_non_encore_notifiees():
    db = FauxSession(
        gestion=[1],
        clients=[50],
        projet=SimpleNamespace(id=1, client_id=50, responsable_id=30, archive=False),
        taches=[_tache()],
    )

    assert asyncio.run(notif.scanner_taches_en_retard(db)) == 1
    assert len(db.par_type("tache_retard")) >= 1


def test_scan_ne_renvoie_rien_sans_tache_en_retard():
    db = FauxSession(taches=[])

    assert asyncio.run(notif.scanner_taches_en_retard(db)) == 0
    assert db.ajoutes == []


def test_scan_ignore_les_projets_archives():
    """Un projet archivé ne doit pas générer de bruit chez la direction."""
    db = FauxSession(
        projet=SimpleNamespace(id=1, client_id=50, responsable_id=30, archive=True),
        taches=[_tache()],
    )

    assert asyncio.run(notif.scanner_taches_en_retard(db)) == 0
    assert db.ajoutes == []


def test_scan_rearme_les_taches_revenues_dans_les_temps():
    """Le réarmement permet une nouvelle alerte si la tâche repart en retard."""
    db = FauxSession(taches=[_tache()])

    asyncio.run(notif.scanner_taches_en_retard(db))

    # Le SET passe la valeur en paramètre lié : on vérifie que la colonne est
    # bien remise dans le SET, et que le WHERE cible le marqueur non nul.
    assert any("SET retard_notifie_le=" in u for u in db.updates)
    assert any("retard_notifie_le IS NOT NULL" in u for u in db.updates)


def test_scan_n_encaisse_pas_de_commit():
    """Le scan fait partie d'un flux plus large : le commit reste à l'appelant."""
    db = FauxSession(taches=[_tache()])

    asyncio.run(notif.scanner_taches_en_retard(db))

    assert db.commits == 0


# ============================================================
# 6. La réévaluation après une modification de tâche (routeur)
# ============================================================

def test_reevaluer_retard_alerte_la_tache_qui_vient_de_basculer():
    from app.routers import taches as routeur_taches

    db = FauxSession(gestion=[1], clients=[50])
    tache = _tache()  # retard_notifie_le = None

    asyncio.run(routeur_taches._reevaluer_retard(db, tache))

    assert len(db.par_type("tache_retard")) >= 1
    assert tache.retard_notifie_le is not None


def test_reevaluer_retard_ne_relaie_pas_deuxieme_fois():
    """Deux évaluations consécutives ne doivent produire qu'une seule alerte."""
    from app.routers import taches as routeur_taches

    db = FauxSession(gestion=[1], clients=[50])
    tache = _tache()

    asyncio.run(routeur_taches._reevaluer_retard(db, tache))
    avant = len(db.par_type("tache_retard"))
    asyncio.run(routeur_taches._reevaluer_retard(db, tache))

    assert len(db.par_type("tache_retard")) == avant


def test_reevaluer_retard_efface_le_marqueur_quand_la_tache_revient():
    """Terminer une tâche en retard réarme : une future alerte reste possible."""
    from app.routers import taches as routeur_taches

    db = FauxSession()
    tache = _tache(statut=StatutTache.TERMINE)
    tache.retard_notifie_le = date.today()  # déjà alertée

    asyncio.run(routeur_taches._reevaluer_retard(db, tache))

    assert tache.retard_notifie_le is None
    assert db.par_type("tache_retard") == []


def test_reevaluer_retard_commite_pour_fermer_la_session():
    from app.routers import taches as routeur_taches

    db = FauxSession()
    asyncio.run(routeur_taches._reevaluer_retard(db, _tache()))

    assert db.commits == 1

    def add(self, objet):
        self.ajoutes.append(objet)

    async def commit(self):
        self.commits += 1

    def par_type(self, type_notif):
        return [n for n in self.ajoutes if n.type == type_notif]

    def par_destinataire(self, uid, type_notif):
        return [
            n for n in self.ajoutes
            if n.destinataire_id == uid and n.type == type_notif
        ]