# app/core/url_db.py
"""Normalisation de `DATABASE_URL` pour les différents pilotes.

`DATABASE_URL` est une valeur unique, mais trois pilotes la lisent :
  - SQLAlchemy async  → veut un dialecte :        `postgresql+asyncpg://`
  - asyncpg.connect() → veut un DSN « nu » :      `postgresql://`
  - psycopg2.connect()→ veut un DSN « nu » :      `postgresql://`

Or `postgresql+asyncpg://` est une URL **SQLAlchemy**, pas un DSN
PostgreSQL. La transmettre telle quelle à psycopg2 échoue avec :

    invalid dsn: missing "=" after "postgresql+asyncpg://user:pass@h/db"

Ce module est donc la source de vérité unique pour cette conversion.

Point de sécurité : une URL de connexion contient le mot de passe de la
base. Elle ne doit JAMAIS être imprimée dans les logs (Render les archive
et les rend visibles). `url_masquee()` sert à cet effet.
"""
from urllib.parse import urlsplit, urlunsplit

#: Pilotes SQLAlchemy acceptés en entrée (schéma avant le `+`).
SCHEMES_POSTGRES = ("postgresql", "postgres")

#: `postgres://` est un alias historique : SQLAlchemy ne connaît que
#: `postgresql+asyncpg`, et refuserait `postgres+asyncpg`
#: (NoSuchModuleError). On canonise donc toujours vers `postgresql`.
SCHEME_CANONIQUE = "postgresql"

#: Pilote async utilisé par l'application (voir requirements.txt : asyncpg).
DIALECTE_ASYNC = "asyncpg"


def _schemes(url: str) -> tuple[str, list[str]]:
    """Sépare `postgresql+asyncpg://…` en ('postgresql', ['asyncpg'])."""
    brut = url.split("://", 1)[0].strip().lower()
    if "://" not in url:
        raise ValueError(
            "DATABASE_URL est invalide : le format attendu est "
            "postgresql://utilisateur:mot_de_passe@hote:5432/base"
        )
    base, _, pilote = brut.partition("+")
    if base not in SCHEMES_POSTGRES:
        raise ValueError(
            f"DATABASE_URL est invalide : schéma « {brut} ». "
            "Seuls postgresql:// et postgres:// sont acceptés."
        )
    return base, [p for p in pilote.split("+") if p]


def url_pour_sqlalchemy(url: str, pilote: str = DIALECTE_ASYNC) -> str:
    """Force le dialecte SQLAlchemy attendu.

    Accepte aussi bien `postgresql://` que `postgresql+asyncpg://` en
    entrée (le second est renvoyé inchangé) : le même `DATABASE_URL` peut
    donc être défini dans le `.env` local et sur Render.

    L'alias `postgres://` est canonisé en `postgresql+asyncpg://` : le
    dialecte `postgres+asyncpg` n'existe pas et lèverait
    `NoSuchModuleError`.
    """
    _schemes(url)  # valide le format avant de reconstruire
    return _reconstruit(url, f"{SCHEME_CANONIQUE}+{pilote}")


def url_pour_pilote_brut(url: str) -> str:
    """Renvoie un DSN PostgreSQL sans dialecte SQLAlchemy.

    C'est ce format qu'attendent `asyncpg.connect(dsn=…)` et
    `psycopg2.connect(…)`.
    """
    base, _ = _schemes(url)
    return _reconstruit(url, base)


def _reconstruit(url: str, schema: str) -> str:
    """Réécrit l'URL avec un nouveau schéma, en préservant le reste."""
    # On décompose sur le premier « :// » pour ne pas être
    # gêné par un éventuel « : » dans le mot de passe.
    _, separateur, reste = url.partition("://")
    if not separateur:
        raise ValueError("DATABASE_URL est invalide : séparateur « :// » absent.")
    netloc, _, chemin = reste.partition("/")
    return urlunsplit((schema, netloc, "/" + chemin, "", ""))


def url_masquee(url: str) -> str:
    """Version affichable d'une URL : le mot de passe devient `***`.

    À utiliser dans tout message d'erreur ou log.
    """
    try:
        schema, netloc, chemin, _, _ = urlsplit(url_pour_pilote_brut(url))
    except ValueError:
        return "***"

    if "@" not in netloc:
        return urlunsplit((schema, netloc, chemin, "", ""))

    identifiants, _, hote = netloc.rpartition("@")
    if ":" in identifiants:
        identifiants = identifiants.split(":", 1)[0]
    return urlunsplit(
        (f"{SCHEME_CANONIQUE}+{DIALECTE_ASYNC}", f"{identifiants}:***@{hote}", chemin, "", "")
    )


def port_pooler_pgbouncer(url: str) -> bool:
    """`True` si l'URL pointe le pooler Supabase en mode transaction (6543).

    En mode transaction, PgBouncer ne supporte pas les *prepared statements* :
    asyncpg échoue alors sur `cached plan must not change result type`.
    On désactive le cache dans ce cas (voir `database.py`).
    """
    try:
        netloc = url.partition("://")[2].partition("/")[0]
    except Exception:  # pragma: no cover — URL illisible, on ne bloque pas
        return False
    return netloc.rpartition(":")[2] == "6543"
