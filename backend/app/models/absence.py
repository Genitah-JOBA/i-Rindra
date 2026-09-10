# app/models/absence.py
import enum

from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models._enum import pg_enum


class TypeAbsence(str, enum.Enum):
    CONGE = "conge"            # congés payés
    MALADIE = "maladie"        # arrêt maladie / maladie
    PERMISSION = "permission"  # permission exceptionnelle
    AUTRE = "autre"


class StatutAbsence(str, enum.Enum):
    EN_ATTENTE = "en_attente"  # demande envoyée, en attente de décision
    ACCEPTEE = "acceptee"      # validée par la direction
    REFUSEE = "refusee"        # refusée par la direction


class Absence(Base):
    """
    Table 'absence'
    Demande d'absence d'un membre de l'équipe, validée (ou non) par la direction.
    """
    __tablename__ = "absence"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(
        Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type = Column(pg_enum(TypeAbsence, "type_absence"), nullable=False, default=TypeAbsence.CONGE)
    date_debut = Column(Date, nullable=False)
    date_fin = Column(Date, nullable=False)
    motif = Column(String(255), nullable=True)
    statut = Column(
        pg_enum(StatutAbsence, "statut_absence"),
        nullable=False,
        default=StatutAbsence.EN_ATTENTE,
    )
    # Qui a pris la décision (admin/direction), rempli si traité
    decideur_id = Column(
        Integer, ForeignKey("utilisateur.id", ondelete="SET NULL"), nullable=True
    )
    commentaire = Column(Text, nullable=True)  # décision / motif de refus
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    decide_le = Column(DateTime(timezone=True), nullable=True)

    utilisateur = relationship("Utilisateur", foreign_keys=[utilisateur_id])
    decideur = relationship("Utilisateur", foreign_keys=[decideur_id])

    def __repr__(self):
        return f"<Absence {self.type} {self.date_debut}->{self.date_fin} ({self.statut})>"