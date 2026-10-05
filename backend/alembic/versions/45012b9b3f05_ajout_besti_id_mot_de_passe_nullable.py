"""Comptes clients partagés avec Besti : `besti_id` + mot de passe nullable.

Ce que change cette migration, et pourquoi :

- `utilisateur.besti_id` (UUID, unique, nullable) : identifiant du client dans
  Besti. NULL = compte local iRindra classique (inscription, admin) qui garde
  son propre mot de passe. Renseigné = compte *lié*, dont le mot de passe reste
  chez Besti. L'unicité empêche deux comptes iRindra de pointer le même client.
- `utilisateur.mot_de_passe_hash` devient nullable : un compte lié n'a aucun
  hash local, puisque Besti vérifie le mot de passe à chaque connexion. Les
  comptes locaux, eux, conservent leur hash.

Aucune donnée existante n'est modifiée : toutes les lignes actuelles ont
`besti_id = NULL` et un hash non nul. Seule la contrainte de nullabilité
s'assouplit.

Revision ID: 45012b9b3f05
Revises:
Create Date: 2026-10-05 17:42:37.185108

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "45012b9b3f05"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Identifiant du client chez Besti. Index unique : c'est cette colonne qui
    # rend le webhook idempotent (upsert sur besti_id).
    op.add_column(
        "utilisateur",
        sa.Column("besti_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        op.f("ix_utilisateur_besti_id"), "utilisateur", ["besti_id"], unique=True
    )

    # Un compte lié n'a pas de hash local : le mot de passe est vérifié par Besti.
    op.alter_column(
        "utilisateur",
        "mot_de_passe_hash",
        existing_type=sa.String(length=255),
        nullable=True,
    )


def downgrade() -> None:
    # Un rollback ne doit jamais coûter des comptes clients.
    #
    # Rétablir NOT NULL sur `mot_de_passe_hash` est impossible tant qu'un compte
    # lié existe : il n'a par construction aucun hash (son mot de passe est chez
    # Besti). La seule façon de « réussir » serait de supprimer ces comptes —
    # inacceptable, une migration ne doit pas effacer de données métier.
    #
    # On refuse donc explicitement, en indiquant quoi faire. Pour revenir en
    # arrière sur une base de développement, il faut d'abord supprimer les
    # comptes liés via l'interface (ou les détacher), puis relancer le downgrade.
    bind = op.get_bind()

    comptes_lies = bind.execute(
        sa.text("SELECT count(*) FROM utilisateur WHERE besti_id IS NOT NULL")
    ).scalar()
    if comptes_lies:
        raise RuntimeError(
            f"Rollback impossible : {comptes_lies} compte(s) sont liés à Besti "
            "(besti_id renseigné). Leurs mots de passe sont gérés par Besti, ils "
            "n'ont donc pas de hash local, et la colonne mot_de_passe_hash ne "
            "peut pas redevenir NOT NULL sans les supprimer. Supprimez ou "
            "détachez ces comptes avant de relancer le downgrade."
        )

    # Filet de sécurité : la colonne doit aussi être vide, pas seulement sans
    # compte Besti (un hash NULL issu d'une autre cause bloquerait NOT NULL).
    sans_hash = bind.execute(
        sa.text("SELECT count(*) FROM utilisateur WHERE mot_de_passe_hash IS NULL")
    ).scalar()
    if sans_hash:
        raise RuntimeError(
            f"Rollback impossible : {sans_hash} compte(s) n'ont pas de hash de "
            "mot de passe alors qu'ils ne sont pas liés à Besti. Corrigez ces "
            "comptes avant de relancer le downgrade."
        )

    op.alter_column(
        "utilisateur",
        "mot_de_passe_hash",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.drop_index(op.f("ix_utilisateur_besti_id"), table_name="utilisateur")
    op.drop_column("utilisateur", "besti_id")