# suggestion_devis.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base
from app.models._enum import pg_enum


class StatutSuggestionDevis(str, enum.Enum):
    EN_ATTENTE = "en_attente"   # généré par l'IA, à valider / refuser
    VALIDEE = "validee"         # accepté par la direction/DRH
    REFUSEE = "refusee"         # rejeté par la direction/DRH


class SuggestionDevis(Base):
    """
    Table 'suggestion_devis' — devis proposés par l'IA (volet financier).
    Règle "l'IA propose, l'humain valide" (RF-15) appliquée aux devis :
    un devis suggéré reste en attente de validation par la direction/DRH.
    Sauvegarde automatique quand la direction/DRH demande un devis à l'assistant IA.
    """
    __tablename__ = "suggestion_devis"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("client.id", ondelete="SET NULL"), nullable=False, index=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="SET NULL"), nullable=False, index=True)
    titre = Column(String(200), nullable=True)
    demande = Column(Text, nullable=True)          # contexte / demande de l'utilisateur
    contenu_devis = Column(Text, nullable=False)   # devis généré par l'IA
    statut = Column(pg_enum(StatutSuggestionDevis, "statut_suggestion_devis"), nullable=False, default=StatutSuggestionDevis.EN_ATTENTE)
    modele = Column(String(80), nullable=True)     # modèle IA utilisé
    cree_par = Column(Integer, ForeignKey("utilisateur.id", ondelete="SET NULL"), nullable=True)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    client = relationship("Client")
    projet = relationship("Projet")

    def __repr__(self):
        return f"<SuggestionDevis {self.id} ({self.statut})>"