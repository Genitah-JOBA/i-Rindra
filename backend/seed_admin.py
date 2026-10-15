# backend/seed_admin.py
"""Seed du compte admin initial (un seul compte `direction`).

Usage :
    cd backend
    python seed_admin.py

Les valeurs sont lues dans `.env` (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOM,
ADMIN_PRENOM), avec des valeurs par défaut en dur dans ce fichier si le
`.env` ne les définit pas. Un seul compte est créé ; le script est
idempotent (relançable sans doublon).

Note rôle : l'ENUM `role_utilisateur` ne connaît pas `admin` — le top
privilège réel est `direction`. Le compte seedé est donc `direction`.
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()

# --- Valeurs par défaut (utilisées si absentes du .env) ---
DEFAULT_ADMIN_EMAIL = "admin@i-rindra.mg"
DEFAULT_ADMIN_PASSWORD = "Admin123!"
DEFAULT_ADMIN_NOM = "Admin"
DEFAULT_ADMIN_PRENOM = "Root"
ADMIN_ROLE = "direction"

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
ADMIN_NOM = os.getenv("ADMIN_NOM", DEFAULT_ADMIN_NOM).strip() or DEFAULT_ADMIN_NOM
ADMIN_PRENOM = os.getenv("ADMIN_PRENOM", DEFAULT_ADMIN_PRENOM).strip() or DEFAULT_ADMIN_PRENOM

DATABASE_URL = os.getenv("DATABASE_URL", "")


def _log(message: str) -> None:
    try:
        print(message)
    except UnicodeEncodeError:
        print(message.encode("ascii", "replace").decode("ascii"))


def _dsn_brut(database_url: str) -> str:
    """Convertit DATABASE_URL SQLAlchemy -> DSN psycopg2 (comme init_db.py)."""
    url = database_url.strip()
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://"):
        if url.startswith(prefix):
            return "postgresql://" + url[len(prefix):]
    return url


def main() -> int:
    if not DATABASE_URL:
        _log("[ERREUR] DATABASE_URL manquant (.env).")
        return 1
    if not ADMIN_EMAIL or "@" not in ADMIN_EMAIL:
        _log("[ERREUR] ADMIN_EMAIL invalide.")
        return 1
    if not ADMIN_PASSWORD or len(ADMIN_PASSWORD) < 8:
        _log("[ERREUR] ADMIN_PASSWORD trop court (8 car. minimum).")
        return 1

    try:
        import psycopg2
        from passlib.context import CryptContext
    except ImportError as e:
        _log(f"[ERREUR] Dépendance manquante : {e} (pip install -r requirements.txt).")
        return 1

    pwd_context = CryptContext(schemes=["bcrypt"], default="bcrypt", bcrypt__rounds=12)
    mot_de_passe = ADMIN_PASSWORD[:72]  # limite bcrypt, comme security.hash_password
    mot_de_passe_hash = pwd_context.hash(mot_de_passe)

    try:
        with psycopg2.connect(_dsn_brut(DATABASE_URL)) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, role, actif FROM utilisateur WHERE email = %s",
                    (ADMIN_EMAIL,),
                )
                existant = cur.fetchone()
                if existant:
                    _log(f"[OK] Compte déjà présent : {ADMIN_EMAIL} (id={existant[0]}, role={existant[1]}).")
                    return 0
                cur.execute(
                    """
                    INSERT INTO utilisateur (nom, prenom, email, mot_de_passe_hash, role, client_id, metier, actif)
                    VALUES (%s, %s, %s, %s, %s, NULL, %s, TRUE)
                    RETURNING id
                    """,
                    (ADMIN_NOM, ADMIN_PRENOM, ADMIN_EMAIL, mot_de_passe_hash, ADMIN_ROLE, ADMIN_ROLE),
                )
                nouvel_id = cur.fetchone()[0]
            conn.commit()
    except Exception as e:
        _log(f"[ERREUR] Seed impossible : {e}")
        return 1

    _log(f"[OK] Compte admin créé : {ADMIN_EMAIL} (id={nouvel_id}, role={ADMIN_ROLE}).")
    _log("Changez le mot de passe après la première connexion.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
