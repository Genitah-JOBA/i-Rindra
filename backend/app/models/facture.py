# facture.py
from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, ForeignKey, Numeric,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base
from app.models._enum import pg_enum


class StatutFacture(str, enum.Enum):
    BROUILLON = "brouillon"   # créée, pas encore envoyée
    ENVOYEE = "envoyee"       # transmise au client, en attente de paiement
    PAYEE = "payee"           # réglée
    EN_RETARD = "en_retard"   # échéance dépassée, non payée
    ANNULEE = "annulee"       # annulée / avoir


class Facture(Base):
    """
    Table 'facture' — volet financier (accès direction/DRH uniquement, cf. CDC).
    Émise pour un Client, optionnellement rattachée à un Projet.
    Les montants TVA et TTC sont calculés côté serveur à partir du HT et du taux.
    """
    __tablename__ = "facture"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(30), nullable=False, unique=True, index=True)
    client_id = Column(Integer, ForeignKey("client.id", ondelete="RESTRICT"), nullable=False, index=True)
    projet_id = Column(Integer, ForeignKey("projet.id", ondelete="SET NULL"), nullable=True, index=True)
    statut = Column(pg_enum(StatutFacture, "statut_facture"), nullable=False, default=StatutFacture.BROUILLON)
    date_emission = Column(Date, nullable=False)
    date_echeance = Column(Date, nullable=True)
    montant_ht = Column(Numeric(12, 2), nullable=False, default=0)
    taux_tva = Column(Numeric(5, 2), nullable=False, default=20)
    montant_tva = Column(Numeric(12, 2), nullable=False, default=0)
    montant_ttc = Column(Numeric(12, 2), nullable=False, default=0)
    notes = Column(Text, nullable=True)
    cree_par = Column(Integer, ForeignKey("utilisateur.id", ondelete="SET NULL"), nullable=True)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())
    modifie_le = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relations (lecture seule côté facture)
    client = relationship("Client")
    projet = relationship("Projet")

    def __repr__(self):
        return f"<Facture {self.numero} ({self.statut}) {self.montant_ttc}>"
