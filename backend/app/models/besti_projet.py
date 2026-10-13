# besti_projet.py
"""
Projets déclarés par Besti, en CONSULTATION SEULE dans iRindra.

Ces tables sont volontairement distinctes de `projet` / `fichier` : un projet
Besti n'a ni tâches, ni avancement, ni fichiers stockés ici. iRindra garde le
dernier instantané reçu de Besti (qui reste seul maître de ces données) et
l'historique des statuts.

Chaque élément est repéré par son identifiant public Besti (unique) : c'est ce
qui rend le webhook idempotent et permet de mettre à jour un instantané sans
doublon.
"""
from sqlalchemy import (
    BigInteger, Column, Date, DateTime, ForeignKey, Integer, String, Text, Uuid,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

#: Motifs d'archivage d'un projet Besti (un projet n'est jamais effacé).
MOTIF_SUPPRIME_BESTI = "supprime_besti"
MOTIF_COMPTE_DESACTIVE = "compte_desactive"


class BestiProjet(Base):
    """Table 'besti_projet' : dernier instantané d'un projet Besti."""

    __tablename__ = "besti_projet"

    id = Column(Integer, primary_key=True, index=True)
    besti_projet_id = Column(Uuid, unique=True, nullable=False, index=True)
    # Compte lié (retrouvé par son `besti_id` à la réception de l'événement).
    utilisateur_id = Column(
        Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nom = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    cree_le_besti = Column(Date, nullable=True)
    echeance_souhaitee = Column(Date, nullable=True)
    # Statut calculé par Besti : liste NON figée ici (un code inconnu reste valide).
    statut_code = Column(String(100), nullable=False)
    statut_libelle = Column(String(255), nullable=False)
    statut_depuis = Column(DateTime(timezone=True), nullable=True)
    # `updatedAt` du dernier instantané appliqué : un envoi plus ancien est ignoré.
    maj_besti_le = Column(DateTime(timezone=True), nullable=False)
    archive_le = Column(DateTime(timezone=True), nullable=True)
    motif_archivage = Column(String(50), nullable=True)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    modifie_le = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    cahiers = relationship(
        "BestiCahier",
        back_populates="projet",
        cascade="all, delete-orphan",
        order_by="BestiCahier.ordre",
        lazy="selectin",
    )
    historique = relationship(
        "BestiStatutHistorique",
        back_populates="projet",
        cascade="all, delete-orphan",
        order_by="BestiStatutHistorique.id",
        lazy="selectin",
    )

    def __repr__(self):
        return f"<BestiProjet {self.besti_projet_id}>"


class BestiCahier(Base):
    """Table 'besti_cahier' : cahier des charges (ou demande) d'un projet Besti."""

    __tablename__ = "besti_cahier"

    id = Column(Integer, primary_key=True, index=True)
    besti_cahier_id = Column(Uuid, unique=True, nullable=False, index=True)
    projet_id = Column(
        Integer, ForeignKey("besti_projet.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Position dans l'instantané : l'ordre d'affichage est celui de Besti.
    ordre = Column(Integer, nullable=False, default=0)
    titre = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    soumis_le = Column(Date, nullable=True)
    statut_code = Column(String(100), nullable=True)
    statut_libelle = Column(String(255), nullable=True)

    projet = relationship("BestiProjet", back_populates="cahiers")
    fichiers = relationship(
        "BestiFichier",
        back_populates="cahier",
        cascade="all, delete-orphan",
        order_by="BestiFichier.id",
        lazy="selectin",
    )
    liens = relationship(
        "BestiLien",
        back_populates="cahier",
        cascade="all, delete-orphan",
        order_by="BestiLien.id",
        lazy="selectin",
    )


class BestiFichier(Base):
    """
    Table 'besti_fichier' : MÉTADONNÉES d'un fichier Besti.

    Le fichier lui-même reste chez Besti : il est relayé à la demande, après
    vérification que le demandeur est bien le client du projet.
    """

    __tablename__ = "besti_fichier"

    id = Column(Integer, primary_key=True, index=True)
    besti_fichier_id = Column(Uuid, unique=True, nullable=False, index=True)
    cahier_id = Column(
        Integer, ForeignKey("besti_cahier.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nom = Column(String(255), nullable=False)
    type_mime = Column(String(150), nullable=True)
    taille_octets = Column(BigInteger, nullable=True)
    ajoute_le = Column(DateTime(timezone=True), nullable=True)

    cahier = relationship("BestiCahier", back_populates="fichiers")


class BestiLien(Base):
    """Table 'besti_lien' : lien externe (maquettes, documents partagés…)."""

    __tablename__ = "besti_lien"

    id = Column(Integer, primary_key=True, index=True)
    besti_lien_id = Column(Uuid, unique=True, nullable=False, index=True)
    cahier_id = Column(
        Integer, ForeignKey("besti_cahier.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url = Column(Text, nullable=False)
    libelle = Column(String(255), nullable=True)
    fournisseur = Column(String(100), nullable=True)

    cahier = relationship("BestiCahier", back_populates="liens")


class BestiStatutHistorique(Base):
    """Table 'besti_statut_historique' : chaque changement de statut reçu."""

    __tablename__ = "besti_statut_historique"

    id = Column(Integer, primary_key=True, index=True)
    projet_id = Column(
        Integer, ForeignKey("besti_projet.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code = Column(String(100), nullable=False)
    libelle = Column(String(255), nullable=False)
    depuis = Column(DateTime(timezone=True), nullable=True)
    enregistre_le = Column(DateTime(timezone=True), server_default=func.now())

    projet = relationship("BestiProjet", back_populates="historique")
