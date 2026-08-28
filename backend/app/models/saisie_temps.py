# app/models/saisie_temps.py

from sqlalchemy import Column, Integer, Date, DateTime, ForeignKey, String, CheckConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base

class SaisieTemps(Base):
    __tablename__ = "saisie_temps"

    id = Column(Integer, primary_key=True, index=True)
    tache_id = Column(Integer, ForeignKey("tache.id", ondelete="CASCADE"), nullable=False, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), nullable=False, index=True)
    duree_min = Column(Integer, nullable=False)
    date = Column(Date, nullable=False, server_default=func.current_date())
    note = Column(String(500), nullable=True)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    modifie_le = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("duree_min > 0", name="chk_duree_min_positive"),
    )

    tache = relationship("Tache", back_populates="saisies_temps")
    utilisateur = relationship("Utilisateur")

    def __repr__(self):
        return f"<SaisieTemps {self.duree_min}min sur tache {self.tache_id}>"