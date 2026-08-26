# _enum.py
# Helper pour déclarer les colonnes enum de façon COHÉRENTE.
#
# Par défaut, SQLAlchemy stocke le NOM du membre Python (ex. "DIRECTION").
# Or nos valeurs métier (et l'API, et schema.sql) utilisent les VALEURS
# en minuscules (ex. "direction"). `values_callable` force SQLAlchemy à
# utiliser la valeur -> la base et l'API parlent le même langage.
from sqlalchemy import Enum


def pg_enum(enum_cls, name: str) -> Enum:
    """
    Crée une colonne Enum PostgreSQL :
      - `name` : nom EXACT du type dans la base (ex. "role_utilisateur")
      - stocke la .value du membre (minuscule), pas son nom.
    """
    return Enum(
        enum_cls,
        name=name,
        values_callable=lambda e: [membre.value for membre in e],
    )
