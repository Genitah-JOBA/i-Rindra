# saisie_temps.py
from sqlalchemy import Column, Integer, Text, Date, ForeignKey, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class SaisieTemps(Base):
    """
    Table 'saisie_temps'
    Temps passé par un utilisateur sur une tâche (suivi allégé — RF-23, RF-24).
    Sert aussi de support à l'analyse de charge par l'IA.
    """
    __tablename__ = "saisie_temps"

    id = Column(Integer, primary_key=True, index=True)
    tache_id = Column(Integer, ForeignKey("tache.id", ondelete="CASCADE"), nullable=False, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), nullable=False, index=True)
    duree_min = Column(Integer, nullable=False)
    date_saisie = Column(Date, nullable=False, server_default=func.current_date())
    note = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("duree_min > 0", name="chk_duree_positive"),
    )

    tache = relationship("Tache", back_populates="saisies_temps")
    utilisateur = relationship("Utilisateur")

    def __repr__(self):
        return f"<SaisieTemps tache={self.tache_id} {self.duree_min}min>"
