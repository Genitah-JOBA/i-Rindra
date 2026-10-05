# alembic/env.py
"""
Environnement Alembic d'iRindra.

Deux partis pris, calqués sur le fonctionnement de l'application :

- l'URL de connexion n'est PAS écrite dans `alembic.ini` (un fichier versionné
  ne doit jamais porter de mot de passe) : elle vient de `settings.DATABASE_URL`,
  donc du `.env`, comme le reste de l'API ;
- Alembic pilote psycopg2 en synchrone, l'application asyncpg en asynchrone.
  `url_pour_pilote_brut()` est la fonction du projet qui traduit l'URL vers le
  format attendu par le pilote brut — on s'en sert plutôt que de retirer le
  dialecte à la main.

`target_metadata` est le `Base.metadata` de l'application, ce qui rend
`--autogenerate` possible en partant des vrais modèles.
"""
from logging.config import fileConfig
from pathlib import Path
import sys

from alembic import context
from sqlalchemy import engine_from_config, pool

# Permet d'importer `app.*` quand Alembic est lancé depuis la racine du projet.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.database import Base
from app.core.url_db import url_pour_pilote_brut

# Importer les modèles enregistre leurs tables dans Base.metadata : sans cet
# import, `--autogenerate` ne verrait qu'une base vide.
import app.models  # noqa: F401

config = context.config

# `set_main_option` interprète les `%` : un mot de passe contenant `%` ferait
# sinon échouer la lecture de l'INI. On les double.
config.set_main_option("sqlalchemy.url", url_pour_pilote_brut(settings.DATABASE_URL).replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Émet le SQL des migrations sans se connecter à la base."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Applique les migrations sur une connexion directe à la base."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()