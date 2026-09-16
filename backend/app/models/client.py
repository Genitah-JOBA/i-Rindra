# client.py
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Client(Base):
    """
    Table 'client'
    Entreprise / personne cliente (entité métier, distincte du compte utilisateur
    de rôle 'client'). Un client peut avoir plusieurs projets.
    """
    __tablename__ = "client"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(150), nullable=False)
    contact = Column(String(150), nullable=True)
    email = Column(String(150), nullable=True)
    telephone = Column(String(30), nullable=True)
    # Devise du client : "Ar" = marché national, sinon devise étrangère
    # (ex. "EUR", "USD"…) => client international.
    devise = Column(String(10), nullable=False, default="Ar")
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    # 1 Client -> N Projets
    projets = relationship("Projet", back_populates="client")

    def __repr__(self):
        return f"<Client {self.nom}>"
