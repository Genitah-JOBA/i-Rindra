# app/schemas/dashboard.py

"""
Schémas Pydantic pour le Dashboard (RF-16 à RF-18).
"""

from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import Optional, List
from enum import Enum

from app.schemas.projet import StatutSanteEnum

class DashboardProjet(BaseModel):
    """Projet dans la vue dashboard"""
    id: int
    nom: str
    statut_sante: StatutSanteEnum
    avancement_pct: float
    date_debut: Optional[date]
    date_fin_prevue: Optional[date]
    responsable_id: int
    client_id: int
    nb_taches_total: int = 0
    nb_taches_terminees: int = 0
    en_retard: bool = False
    jours_retard: Optional[int] = None
    
    model_config = ConfigDict(from_attributes=True)

class DashboardIndicateurs(BaseModel):
    """Indicateurs globaux du dashboard"""
    total_projets: int = 0
    sante_vert: int = 0
    sante_orange: int = 0
    sante_rouge: int = 0
    total_taches: int = 0
    taches_a_faire: int = 0
    taches_en_cours: int = 0
    taches_en_revue: int = 0
    taches_terminees: int = 0
    taches_retard: int = 0

class DashboardAlerte(BaseModel):
    """Alerte du dashboard (RF-18)"""
    type: str  # "projet_retard", "tache_retard", "deadline_approche", "projet_rouge"
    message: str
    priorite: str  # "haute", "moyenne", "basse"
    projet_id: int
    tache_id: Optional[int] = None
    date: date


class DashboardResponse(BaseModel):
    """Réponse agrégée du dashboard : projets + indicateurs + alertes."""
    projets: List[DashboardProjet]
    indicateurs: DashboardIndicateurs
    alertes: List[DashboardAlerte]