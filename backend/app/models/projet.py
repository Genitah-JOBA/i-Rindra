# projet.py
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey,
    CheckConstraint,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base
from app.models._enum import pg_enum


class StatutSante(str, enum.Enum):
    VERT = "vert"
    ORANGE = "orange"
    ROUGE = "rouge"


class Projet(Base):
    """
    Table 'projet'
    Objet central de la plateforme : statut de santé, avancement, dates, fichiers.
    Appartient à un Client, contient des Tâches et des Jalons.
    """
    __tablename__ = "projet"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    client_id = Column(Integer, ForeignKey("client.id", ondelete="RESTRICT"), nullable=False, index=True)
    responsable_id = Column(Integer, ForeignKey("utilisateur.id", ondelete="SET NULL"), nullable=True, index=True)
    date_debut = Column(Date, nullable=True)
    date_fin_prevue = Column(Date, nullable=True)
    statut_sante = Column(pg_enum(StatutSante, "statut_sante"), nullable=False, default=StatutSante.VERT)
    avancement_pct = Column(Integer, nullable=False, default=0)   # calculé depuis les tâches (RF-09)
    archive = Column(Boolean, nullable=False, default=False)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    modifie_le = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("avancement_pct BETWEEN 0 AND 100", name="chk_avancement_pct"),
    )

    # Relations
    client = relationship("Client", back_populates="projets")
    responsable = relationship("Utilisateur")
    membres = relationship("ProjetMembre", back_populates="projet", cascade="all, delete-orphan")
    taches = relationship("Tache", back_populates="projet", cascade="all, delete-orphan")
    jalons = relationship("Jalon", back_populates="projet", cascade="all, delete-orphan")
    fichiers = relationship("Fichier", back_populates="projet", cascade="all, delete-orphan")
    analyses_ia = relationship("AnalyseIA", back_populates="projet", cascade="all, delete-orphan")
    suggestions = relationship("SuggestionTache", back_populates="projet", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Projet {self.nom} ({self.statut_sante})>"


class ProjetMembre(Base):
    """
    Table 'projet_membre'
    Association N↔N entre un projet et les utilisateurs de son équipe (RF-06, RF-13).
    Porte le rôle du membre dans le projet (developpeur, integrateur, designer...).
    """
    __tablename__ = "projet_membre"

    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="CASCADE"), primary_key=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), primary_key=True)
    role_dans_projet = Column(String(60), nullable=True)

    projet = relationship("Projet", back_populates="membres")
    utilisateur = relationship("Utilisateur")

    def __repr__(self):
        return f"<ProjetMembre projet={self.projet_id} user={self.utilisateur_id}>"
