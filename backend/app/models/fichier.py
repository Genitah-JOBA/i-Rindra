# fichier.py
from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Fichier(Base):
    """
    Table 'fichier'
    Document joint à un projet (dont le cahier des charges) — RF-08.
    """
    __tablename__ = "fichier"

    id = Column(Integer, primary_key=True, index=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="CASCADE"), nullable=False, index=True)
    nom = Column(String(255), nullable=False)
    chemin_ou_url = Column(Text, nullable=False)
    type_mime = Column(String(100), nullable=True)
    taille_octets = Column(BigInteger, nullable=True)
    televerse_par = Column(Integer, ForeignKey("utilisateur.id", ondelete="SET NULL"), nullable=True)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    projet = relationship("Projet", back_populates="fichiers")
    auteur = relationship("Utilisateur")

    def __repr__(self):
        return f"<Fichier {self.nom}>"
