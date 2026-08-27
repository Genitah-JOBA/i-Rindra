# app/models/projet_membre.py

from sqlalchemy import Column, Integer, ForeignKey, String
from sqlalchemy.orm import relationship

from app.core.database import Base

class ProjetMembre(Base):
    """
    Table 'projet_membre'
    Relation N↔N entre Projet et Utilisateur.
    Définit l'équipe affectée à un projet.
    """
    __tablename__ = "projet_membre"

    id = Column(Integer, primary_key=True, index=True)
    
    projet_id = Column(Integer, ForeignKey("projet.id"), nullable=False)
    utilisateur_id = Column(Integer, ForeignKey("utilisateur.id"), nullable=False)
    
    # Rôle dans le projet (ex: "chef_de_projet", "dev", "designer")
    role_dans_projet = Column(String(50), nullable=True)
    
    # Relations
    # projet = relationship("Projet", back_populates="membres")
    # utilisateur = relationship("Utilisateur")
    
    def __repr__(self):
        return f"<ProjetMembre projet={self.projet_id} user={self.utilisateur_id}>"