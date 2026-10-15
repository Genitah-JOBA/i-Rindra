# conversation_ia.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class ConversationIA(Base):
    """
    Table 'conversation_ia'
    Historique des conversations avec l'assistant IA : chaque utilisateur
    retrouve ses échanges passés (et uniquement les siens).
    """
    __tablename__ = "conversation_ia"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), nullable=False, index=True)
    titre = Column(String(120), nullable=False)   # tiré du premier message
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    modifie_le = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    messages = relationship(
        "MessageIA", back_populates="conversation",
        cascade="all, delete-orphan", order_by="MessageIA.id",
    )

    def __repr__(self):
        return f"<ConversationIA {self.titre}>"


class MessageIA(Base):
    """Table 'message_ia' — un message (utilisateur ou IA) d'une conversation."""
    __tablename__ = "message_ia"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversation_ia.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)     # 'user' | 'assistant'
    contenu = Column(Text, nullable=False)
    devis_sauve = Column(Integer, nullable=False, default=0)  # 1 si un devis a été enregistré
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("ConversationIA", back_populates="messages")
