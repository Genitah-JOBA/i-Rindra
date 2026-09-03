# app/models/notification.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Notification(Base):
    """
    Table 'notification'
    Une notification destinée à un utilisateur (nouveau projet, affectation,
    avancement de tâche…). Chaque destinataire a sa propre ligne.
    """
    __tablename__ = "notification"

    id = Column(Integer, primary_key=True, index=True)
    destinataire_id = Column(
        Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type = Column(String(50), nullable=False)  # projet_cree | membre_ajoute | tache_avancement
    message = Column(Text, nullable=False)
    lien = Column(String(255), nullable=True)   # ex: "/projets/5" ou "/taches"
    lu = Column(Boolean, nullable=False, default=False)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    destinataire = relationship("Utilisateur")

    def __repr__(self):
        return f"<Notification {self.type} -> user {self.destinataire_id}>"
