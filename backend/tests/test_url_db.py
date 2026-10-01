# tests/test_url_db.py
"""Tests de la normalisation de `DATABASE_URL` (aucune base, aucun réseau).

Contexte : sur Render, `DATABASE_URL` est fournie au format SQLAlchemy
(`postgresql+asyncpg://…`). Ce format est refusé tel quel par psycopg2 et
asyncpg, qui plantent au démarrage avec « invalid dsn ».
On vérifie ici les trois guarantees du module :
  1. le dialecte est ajouté pour SQLAlchemy, retiré pour les pilotes bruts ;
  2. le mot de passe ne fuit jamais dans une version affichable ;
  3. le port 6543 (pooler transaction) est détecté.
"""
import pytest

from app.core.url_db import (
    port_pooler_pgbouncer,
    url_masquee,
    url_pour_pilote_brut,
    url_pour_sqlalchemy,
)

# URL réellement fournie par Render lors de l'échec :
URL_RENDER = (
    "postgresql+asyncpg://postgres.vdhmiamuyxrstogqigbu:pwd@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
)
MOT_DE_PASSE = "pwd"


# ============================================================
# Conversion vers SQLAlchemy (async)
# ============================================================

def test_sqlalchemy_ajoute_le_dialecte_asyncpg():
    url = "postgresql://user:pass@localhost:5432/Gestion_Projet"
    assert url_pour_sqlalchemy(url) == "postgresql+asyncpg://user:pass@localhost:5432/Gestion_Projet"


def test_sqlalchemy_est_idempotent():
    """Une URL déjà en dialecte doit rester inchangée."""
    assert url_pour_sqlalchemy(URL_RENDER) == URL_RENDER


def test_sqlalchemy_accepte_le_prefixe_postgres_court():
    assert url_pour_sqlalchemy("postgres://u:p@h:5432/db").startswith("postgresql+asyncpg://")


def test_sqlalchemy_conserve_port_et_base():
    convertie = url_pour_sqlalchemy("postgresql://u:p@hote:6543/ma_base")
    assert ":6543" in convertie
    assert convertie.endswith("/ma_base")


# ============================================================
# Conversion vers les pilotes bruts (psycopg2 / asyncpg)
# ============================================================

def test_pilote_brut_retire_le_dialecte_asyncpg():
    """C'est LE correctif de l'erreur « invalid dsn » de Render."""
    dsn = url_pour_pilote_brut(URL_RENDER)
    assert dsn.startswith("postgresql://")
    assert "+asyncpg" not in dsn


def test_pilote_brut_laisse_passer_une_url_simple():
    url = "postgresql://user:pass@localhost:5432/Gestion_Projet"
    assert url_pour_pilote_brut(url) == url


def test_pilote_brut_conserve_hote_port_et_base():
    dsn = url_pour_pilote_brut(URL_RENDER)
    assert "@aws-1-eu-west-1.pooler.supabase.com:5432/" in dsn
    assert dsn.endswith("/postgres")


def test_pilote_brut_gere_un_schema_avec_un_separateur():
    """`urlsplit` casse les DSN « motdepasse=a b » : on décompose à la main."""
    dsn = url_pour_pilote_brut("postgresql+asyncpg://user:a:b@hote:5432/db")
    assert dsn == "postgresql://user:a:b@hote:5432/db"


# ============================================================
# Sécurité : le mot de passe ne doit jamais fuiter
# ============================================================

def test_url_masquee_cache_le_mot_de_passe():
    masquee = url_masquee(URL_RENDER)
    assert MOT_DE_PASSE not in masquee
    assert "***" in masquee


def test_url_masquee_garde_les_informations_utiles():
    """Masquer ne doit pas rendre l'URL inexploitable pour le debug."""
    masquee = url_masquee(URL_RENDER)
    assert "aws-1-eu-west-1.pooler.supabase.com" in masquee
    assert "postgres.vdhmiamuyxrstogqigbu" in masquee  # l'utilisateur aide au diagnostic


def test_url_masquee_sans_mot_de_passe_ne_echoue_pas():
    assert url_masquee("postgresql://user@hote:5432/db")


def test_url_masquee_illisible_ne_echoue_pas():
    assert url_masquee("pas-une-url") == "***"


# ============================================================
# Détection du pooler en mode transaction (port 6543)
# ============================================================

def test_port_6543_detecte():
    assert port_pooler_pgbouncer(
        "postgresql+asyncpg://postgres.ref:pwd@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    ) is True


def test_port_5432_non_detecte():
    assert port_pooler_pgbouncer(URL_RENDER) is False


def test_sans_port_non_detecte():
    assert port_pooler_pgbouncer("postgresql://u:p@hote/db") is False


# ============================================================
# URLs invalides : un message clair plutôt qu'une erreur opaque
# ============================================================

@pytest.mark.parametrize(
    "url",
    ["pas-une-url", "mysql://user:pass@hote:3306/db", "http://hote/db", ""],
)
def test_url_invalide_leve_une_erreur_explicite(url):
    with pytest.raises(ValueError):
        url_pour_pilote_brut(url)
