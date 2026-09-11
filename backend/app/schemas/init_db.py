# backend/init_db.py
import os
import psycopg2
from pathlib import Path

# Se connecte à la base de données en utilisant la variable d'environnement
# DATABASE_URL qui sera fournie par Render.
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise Exception("La variable d'environnement DATABASE_URL est manquante.")

# Le chemin vers le fichier schema.sql se trouve à la racine du projet.
# Sur Render, le répertoire racine est le dossier 'backend' que vous avez spécifié.
# Il faut donc remonter d'un niveau pour trouver schema.sql.
# Adaptez ce chemin si nécessaire.
SCHEMA_PATH = Path(__file__).parent.parent / "schema.sql"

print(f"Lecture du schéma depuis : {SCHEMA_PATH}")

sql_content = SCHEMA_PATH.read_text(encoding="utf-8")

# Connexion à la base de données et exécution du script
try:
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql_content)
        conn.commit()
    print("✅ Schéma de base de données initialisé avec succès.")
except Exception as e:
    print(f"❌ Erreur lors de l'initialisation de la base de données: {e}")
    