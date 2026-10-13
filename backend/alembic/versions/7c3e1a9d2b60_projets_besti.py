"""Projets Besti en consultation : projets, cahiers, fichiers, liens, historique.

Ce que crée cette migration, et pourquoi :

- `besti_projet` : dernier instantané d'un projet Besti, relié au compte lié
  (`utilisateur_id`). Jamais effacé : `archive_le` + `motif_archivage`
  (`supprime_besti` | `compte_desactive`).
- `besti_cahier`, `besti_fichier` (métadonnées seulement : le fichier reste
  chez Besti), `besti_lien` : contenu de l'instantané.
- `besti_statut_historique` : une ligne par changement de statut reçu.

Chaque élément porte son identifiant public Besti, unique : c'est ce qui rend
le webhook idempotent.

Les tables sont aussi créées au démarrage de l'API (`create_all`) : chaque
création est donc conditionnelle, pour que cette migration passe sur une base
où l'API a déjà tourné. Aucune table existante n'est modifiée.

Revision ID: 7c3e1a9d2b60
Revises: 45012b9b3f05
Create Date: 2026-10-12 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "7c3e1a9d2b60"
down_revision: Union[str, None] = "45012b9b3f05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = (
    "besti_statut_historique",
    "besti_lien",
    "besti_fichier",
    "besti_cahier",
    "besti_projet",
)


def _existe(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table)


def upgrade() -> None:
    if not _existe("besti_projet"):
        op.create_table(
            "besti_projet",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("besti_projet_id", sa.Uuid(), nullable=False),
            sa.Column(
                "utilisateur_id",
                sa.Integer(),
                sa.ForeignKey("utilisateur.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("nom", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("cree_le_besti", sa.Date(), nullable=True),
            sa.Column("echeance_souhaitee", sa.Date(), nullable=True),
            sa.Column("statut_code", sa.String(100), nullable=False),
            sa.Column("statut_libelle", sa.String(255), nullable=False),
            sa.Column("statut_depuis", sa.DateTime(timezone=True), nullable=True),
            sa.Column("maj_besti_le", sa.DateTime(timezone=True), nullable=False),
            sa.Column("archive_le", sa.DateTime(timezone=True), nullable=True),
            sa.Column("motif_archivage", sa.String(50), nullable=True),
            sa.Column("cree_le", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("modifie_le", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_besti_projet_id", "besti_projet", ["id"])
        op.create_index(
            "ix_besti_projet_besti_projet_id", "besti_projet", ["besti_projet_id"], unique=True
        )
        op.create_index("ix_besti_projet_utilisateur_id", "besti_projet", ["utilisateur_id"])

    if not _existe("besti_cahier"):
        op.create_table(
            "besti_cahier",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("besti_cahier_id", sa.Uuid(), nullable=False),
            sa.Column(
                "projet_id",
                sa.Integer(),
                sa.ForeignKey("besti_projet.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("ordre", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("titre", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("soumis_le", sa.Date(), nullable=True),
            sa.Column("statut_code", sa.String(100), nullable=True),
            sa.Column("statut_libelle", sa.String(255), nullable=True),
        )
        op.create_index("ix_besti_cahier_id", "besti_cahier", ["id"])
        op.create_index(
            "ix_besti_cahier_besti_cahier_id", "besti_cahier", ["besti_cahier_id"], unique=True
        )
        op.create_index("ix_besti_cahier_projet_id", "besti_cahier", ["projet_id"])

    if not _existe("besti_fichier"):
        op.create_table(
            "besti_fichier",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("besti_fichier_id", sa.Uuid(), nullable=False),
            sa.Column(
                "cahier_id",
                sa.Integer(),
                sa.ForeignKey("besti_cahier.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("nom", sa.String(255), nullable=False),
            sa.Column("type_mime", sa.String(150), nullable=True),
            sa.Column("taille_octets", sa.BigInteger(), nullable=True),
            sa.Column("ajoute_le", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_besti_fichier_id", "besti_fichier", ["id"])
        op.create_index(
            "ix_besti_fichier_besti_fichier_id", "besti_fichier", ["besti_fichier_id"], unique=True
        )
        op.create_index("ix_besti_fichier_cahier_id", "besti_fichier", ["cahier_id"])

    if not _existe("besti_lien"):
        op.create_table(
            "besti_lien",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("besti_lien_id", sa.Uuid(), nullable=False),
            sa.Column(
                "cahier_id",
                sa.Integer(),
                sa.ForeignKey("besti_cahier.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("url", sa.Text(), nullable=False),
            sa.Column("libelle", sa.String(255), nullable=True),
            sa.Column("fournisseur", sa.String(100), nullable=True),
        )
        op.create_index("ix_besti_lien_id", "besti_lien", ["id"])
        op.create_index("ix_besti_lien_besti_lien_id", "besti_lien", ["besti_lien_id"], unique=True)
        op.create_index("ix_besti_lien_cahier_id", "besti_lien", ["cahier_id"])

    if not _existe("besti_statut_historique"):
        op.create_table(
            "besti_statut_historique",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "projet_id",
                sa.Integer(),
                sa.ForeignKey("besti_projet.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("code", sa.String(100), nullable=False),
            sa.Column("libelle", sa.String(255), nullable=False),
            sa.Column("depuis", sa.DateTime(timezone=True), nullable=True),
            sa.Column("enregistre_le", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_besti_statut_historique_id", "besti_statut_historique", ["id"])
        op.create_index(
            "ix_besti_statut_historique_projet_id", "besti_statut_historique", ["projet_id"]
        )


def downgrade() -> None:
    # Une migration ne doit pas effacer de données métier : on refuse tant
    # qu'un projet Besti est enregistré (ils se reconstituent depuis Besti par
    # un nouvel envoi, pas depuis une sauvegarde iRindra).
    if _existe("besti_projet"):
        projets = op.get_bind().execute(sa.text("SELECT count(*) FROM besti_projet")).scalar()
        if projets:
            raise RuntimeError(
                f"Rollback impossible : {projets} projet(s) Besti sont enregistrés. "
                "Videz la table besti_projet (après sauvegarde) avant de relancer "
                "le downgrade."
            )
    for table in TABLES:
        if _existe(table):
            op.drop_table(table)
