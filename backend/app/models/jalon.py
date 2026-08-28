# app/models/jalon.py

from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base

class Jalon(Base):
    __tablename__ = "jalon"

    id = Column(Integer, primary_key=True, index=True)
    titre = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="CASCADE"), nullable=False, index=True)
    echeance = Column(Date, nullable=False)
    atteint = Column(Boolean, default=False)
    date_atteint = Column(DateTime(timezone=True), nullable=True)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    modifie_le = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    projet = relationship("Projet", back_populates="jalons")

    def __repr__(self):
        return f"<Jalon {self.titre} ({'✅' if self.atteint else '❌'})>"