# jalon.py
from sqlalchemy import Column, Integer, String, Date, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base


class Jalon(Base):
    """
    Table 'jalon'
    Étape clé (milestone) d'un projet avec une échéance (RF-07).
    """
    __tablename__ = "jalon"

    id = Column(Integer, primary_key=True, index=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="CASCADE"), nullable=False, index=True)
    titre = Column(String(200), nullable=False)
    echeance = Column(Date, nullable=True)
    atteint = Column(Boolean, nullable=False, default=False)

    projet = relationship("Projet", back_populates="jalons")

    def __repr__(self):
        return f"<Jalon {self.titre}>"
