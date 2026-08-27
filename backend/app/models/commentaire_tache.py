# app/models/commentaire_tache.py

"""
Modèle pour les commentaires sur les tâches (RF-14).
Permet aux membres de l'équipe de discuter autour d'une tâche.
"""

from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base

class CommentaireTache(Base):
    """
    Table 'commentaire_tache'
    Commentaires sur une tâche (RF-14).
    """
    __tablename__ = "commentaire_tache"

    # Clé primaire
    id = Column(Integer, primary_key=True, index=True)
    
    # Relations
    tache_id = Column(Integer, ForeignKey("tache.id", ondelete="CASCADE"), nullable=False)
    utilisateur_id = Column(Integer, ForeignKey("utilisateur.id"), nullable=False)
    
    # Contenu
    contenu = Column(Text, nullable=False)
    
    # Date de création
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relations (pour plus tard)
    # tache = relationship("Tache", back_populates="commentaires")
    # utilisateur = relationship("Utilisateur")
    
    def __repr__(self):
        return f"<CommentaireTache {self.id} sur tache {self.tache_id}>"