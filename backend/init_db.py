# backend/init_db.py
"""Charge schema.sql dans la base pointée par DATABASE_URL.

Lancé par Render avant uvicorn : `python init_db.py && uvicorn …`.
Sortir en code 1 en cas d'échec est VOLONTAIRE : le `&&` empêche alors
l'API de démarrer sur une base non initialisée (sinon Render affiche un
service « up » alors que toutes les requêtes échouent).
"""
import os
import sys
from pathlib import Path

import psycopg2

# Ce script est à la racine de `backend/` et tourne donc hors du package
# `app` : on ajoute le dossier au sys.path pour importer app.core.url_db.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.url_db import url_masquee, url_pour_pilote_brut


# Les consoles Windows (cp1252) ne savent pas encoder les emojis ✅/❌ : un
# print décoratif ferait alors planter le gestionnaire d'erreur et
# masquerait la VRAIE cause. On utilise donc des marqueurs ASCII.
def _log(message: str) -> None:
    """Affiche un message sans jamais échouer sur l'encodage console."""
    try:
        print(message)
    except UnicodeEncodeError:
        print(message.encode("ascii", "replace").decode("ascii"))


# Se connecte à la base de données en utilisant la variable d'environnement
# DATABASE_URL qui sera fournie par Render.
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise SystemExit("[ERREUR] La variable d'environnement DATABASE_URL est manquante.")

# `DATABASE_URL` est souvent au format SQLAlchemy (`postgresql+asyncpg://`)
# sur les plateformes managées. psycopg2 n'accepte que `postgresql://` :
# sans cette conversion, on obtient
# « invalid dsn: missing "=" after "postgresql+asyncpg://…" ».
try:
    DSN = url_pour_pilote_brut(DATABASE_URL)
except ValueError as e:
    raise SystemExit(f"[ERREUR] DATABASE_URL invalide : {e}")

# Le chemin vers le fichier schema.sql se trouve à la racine du projet.
# Sur Render, le répertoire racine est le dossier 'backend' que vous avez spécifié.
# Il faut donc remonter d'un niveau pour trouver schema.sql.
# Adaptez ce chemin si nécessaire.
SCHEMA_PATH = Path(__file__).parent.parent / "schema.sql"

_log(f"Lecture du schéma depuis : {SCHEMA_PATH}")

if not SCHEMA_PATH.exists():
    raise SystemExit(f"[ERREUR] Schéma introuvable : {SCHEMA_PATH}")

sql_content = SCHEMA_PATH.read_text(encoding="utf-8")

# Jamais le mot de passe en clair dans les logs Render.
_log(f"Connexion à : {url_masquee(DATABASE_URL)}")

# Connexion à la base de données et exécution du script
try:
    with psycopg2.connect(DSN) as conn:
        with conn.cursor() as cur:
            # Base déjà initialisée (cas de TOUS les redéploiements) : schema.sql
            # n'est pas idempotent (CREATE TYPE / CREATE TABLE échoueraient sur
            # « already exists ») et ferait échouer le démarrage. Les évolutions
            # de schéma sont appliquées par les migrations idempotentes du
            # démarrage de l'API (app/main.py).
            cur.execute("SELECT to_regclass('public.utilisateur') IS NOT NULL")
            if cur.fetchone()[0]:
                _log("[OK] Schéma déjà présent : rien à initialiser.")
                raise SystemExit(0)
            cur.execute(sql_content)
        conn.commit()
    _log("[OK] Schéma de base de données initialisé avec succès.")
except SystemExit:
    raise
except Exception as e:
    # On masque le secret si l'erreur contient l'URL complète (psycopg2
    # recopie parfois le DSN dans son message).
    _log(f"[ERREUR] Initialisation de la base de données impossible : {e}")
    _log(f"   URL testée : {url_masquee(DATABASE_URL)}")
    _log("   Vérifiez DATABASE_URL sur Render (région et project ref Supabase).")
    # Code 1 : le `&&` de Render arrête la chaîne de commandes.
    raise SystemExit(1)
    