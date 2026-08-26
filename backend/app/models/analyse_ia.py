# analyse_ia.py
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base
from app.models._enum import pg_enum
from app.models.tache import PrioriteTache   # réutilise le même type enum


class TypeAnalyseIA(str, enum.Enum):
    ANALYSE_CDC = "analyse_cdc"      # RF-25
    EXTRACTION = "extraction"        # RF-26
    RESUME = "resume"                # RF-27
    DETECTION = "detection"          # RF-28
    STATUT = "statut"                # RF-29
    AFFECTATION = "affectation"      # RF-30
    RECHERCHE = "recherche"          # RF-31


class StatutSuggestion(str, enum.Enum):
    EN_ATTENTE = "en_attente"
    VALIDEE = "validee"
    REJETEE = "rejetee"


class AnalyseIA(Base):
    """
    Table 'analyse_ia'
    Trace de chaque traitement IA (résumé, extraction, statut proposé...).
    Journalisation des appels IA exigée par RNF-03.
    """
    __tablename__ = "analyse_ia"

    id = Column(Integer, primary_key=True, index=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(pg_enum(TypeAnalyseIA, "type_analyse_ia"), nullable=False)
    source = Column(Text, nullable=True)          # fichier / message d'origine
    entree = Column(Text, nullable=True)          # ce qui a été envoyé (strict nécessaire)
    resultat_json = Column(JSONB, nullable=True)  # sortie brute de l'IA
    modele = Column(String(80), nullable=True)    # modèle utilisé (ex. gpt-4o-mini)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    projet = relationship("Projet", back_populates="analyses_ia")
    suggestions = relationship("SuggestionTache", back_populates="analyse_ia")

    def __repr__(self):
        return f"<AnalyseIA {self.type} projet={self.projet_id}>"


class SuggestionTache(Base):
    """
    Table 'suggestion_tache'
    Tâche proposée par l'IA, en attente de validation humaine.
    Cœur de la règle "l'IA propose, l'humain valide" (RF-15, RF-26).
    Si validée, 'tache_id' pointe vers la vraie Tâche créée.
    """
    __tablename__ = "suggestion_tache"

    id = Column(Integer, primary_key=True, index=True)
    analyse_ia_id = Column(Integer, ForeignKey("analyse_ia.id", ondelete="SET NULL"), nullable=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="CASCADE"), nullable=False, index=True)
    titre = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priorite = Column(pg_enum(PrioriteTache, "priorite_tache"), nullable=False, default=PrioriteTache.MOYENNE)
    echeance = Column(Date, nullable=True)
    statut = Column(pg_enum(StatutSuggestion, "statut_suggestion"), nullable=False, default=StatutSuggestion.EN_ATTENTE)
    tache_id = Column(Integer, ForeignKey("tache.id", ondelete="SET NULL"), nullable=True)  # rempli si validée
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    analyse_ia = relationship("AnalyseIA", back_populates="suggestions")
    projet = relationship("Projet", back_populates="suggestions")
    tache = relationship("Tache")   # la tâche créée après validation

    def __repr__(self):
        return f"<SuggestionTache {self.titre} ({self.statut})>"
