# tache.py
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, ForeignKey,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base
from app.models._enum import pg_enum


class StatutTache(str, enum.Enum):
    A_FAIRE = "a_faire"
    EN_COURS = "en_cours"
    EN_REVUE = "en_revue"
    TERMINE = "termine"


class PrioriteTache(str, enum.Enum):
    BASSE = "basse"
    MOYENNE = "moyenne"
    HAUTE = "haute"


class Tache(Base):
    """
    Table 'tache'
    Unité de travail rattachée à un projet, assignée à un utilisateur.
    Statut = colonnes du tableau Kanban (RF-11 à RF-15).
    """
    __tablename__ = "tache"

    id = Column(Integer, primary_key=True, index=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="CASCADE"), nullable=False, index=True)
    titre = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    statut = Column(pg_enum(StatutTache, "statut_tache"), nullable=False, default=StatutTache.A_FAIRE)
    priorite = Column(pg_enum(PrioriteTache, "priorite_tache"), nullable=False, default=PrioriteTache.MOYENNE)
    echeance = Column(Date, nullable=True)
    responsable_id = Column(Integer, ForeignKey("utilisateur.id", ondelete="SET NULL"), nullable=True, index=True)
    ordre = Column(Integer, nullable=False, default=0)   # position dans la colonne Kanban
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    modifie_le = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relations
    projet = relationship("Projet", back_populates="taches")
    responsable = relationship("Utilisateur")
    commentaires = relationship("CommentaireTache", back_populates="tache", cascade="all, delete-orphan")
    saisies_temps = relationship("SaisieTemps", back_populates="tache", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Tache {self.titre} ({self.statut})>"


class CommentaireTache(Base):
    """
    Table 'commentaire_tache'
    Commentaire posté sur une tâche pour suivre son avancement (RF-14).
    """
    __tablename__ = "commentaire_tache"

    id = Column(Integer, primary_key=True, index=True)
    tache_id = Column(Integer, ForeignKey("tache.id", ondelete="CASCADE"), nullable=False, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateur.id", ondelete="SET NULL"), nullable=True)
    contenu = Column(Text, nullable=False)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    tache = relationship("Tache", back_populates="commentaires")
    auteur = relationship("Utilisateur")

    def __repr__(self):
        return f"<CommentaireTache tache={self.tache_id}>"
