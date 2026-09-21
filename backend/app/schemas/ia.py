# app/schemas/ia.py

"""
Schémas Pydantic pour le module IA (statut, ping, chat, analysis métier).
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date


class IaStatus(BaseModel):
    """État de la configuration IA, sans appel réseau."""
    configuree: bool
    modele: str


class IaPing(BaseModel):
    """Réponse du test de bout en bout vers OpenAI."""
    ok: bool
    reponse: str
    modele: str
    tokens: Optional[int] = None


class ChatMessage(BaseModel):
    """Un message dans l'historique de conversation."""
    role: str = Field(..., description="'user' ou 'assistant'")
    content: str


class ChatRequest(BaseModel):
    """Requête de chat envoyée par le frontend."""
    message: str = Field(..., min_length=1, max_length=4000)
    historique: Optional[List[ChatMessage]] = Field(
        default=None,
        description="Historique de conversation (max 20 derniers messages)",
    )


class ChatResponse(BaseModel):
    """Réponse du chat IA."""
    reponse: str
    modele: str
    tokens: Optional[int] = None
    suggestion_devis_sauvee: bool = False  # devis enregistré dans "Suggestion devis par IA"
    nb_projets_contexte: Optional[int] = None  # projets réels injectés dans le prompt


# ============================================================
# RF-25 — Analyse du cahier des charges
# ============================================================

class AnalyseCdcRequest(BaseModel):
    """Contenu du cahier des charges à analyser (si absent, on lit les fichiers du projet)."""
    texte: Optional[str] = Field(
        default=None,
        description="Texte du cahier des charges. Si absent, on lit le CDC (txt/md/csv) "
                    "joint au projet, sinon la description du projet.",
    )


class AnalyseCdcResponse(BaseModel):
    """Synthèse de l'analyse du cahier des charges (RF-25)."""
    analyse_id: int
    points_cles: List[str] = Field(default_factory=list)
    perimetre: str = ""
    risques: List[str] = Field(default_factory=list)
    recommandations: List[str] = Field(default_factory=list)
    modele: str


# ============================================================
# RF-26 — Extraction de tâches & suggestions
# ============================================================

class ExtractionRequest(BaseModel):
    """Contenu à découper en tâches (sinon CDC du projet)."""
    texte: Optional[str] = None


class SuggestionTacheOut(BaseModel):
    """Une tâche proposée par l'IA, en attente de validation (RF-26)."""
    titre: str
    description: Optional[str] = None
    priorite: str = "moyenne"
    echeance: Optional[date] = None


class ExtractionResponse(BaseModel):
    """Résultat de l'extraction de tâches (RF-26)."""
    analyse_id: int
    projet: str
    nombre_suggestions: int
    suggestions: List[SuggestionTacheOut] = Field(default_factory=list)
    modele: str


class SuggestionItem(BaseModel):
    """Une suggestion persistée en base, prête à être validée / rejetée."""
    id: int
    projet_id: int
    titre: str
    description: Optional[str] = None
    priorite: str
    echeance: Optional[date] = None
    statut: str
    tache_id: Optional[int] = None
    cree_le: Optional[str] = None


class SuggestionValiderRequest(BaseModel):
    """Validation d'une suggestion : créée la vraie Tache."""
    responsable_id: Optional[int] = Field(
        default=None, description="Utilisateur affecté à la tâche (optionnel)"
    )


class SuggestionValiderResponse(BaseModel):
    """Résultat de la validation d'une suggestion (RF-26, RF-15)."""
    suggestion_id: int
    tache_id: int
    titre: str
    statut: str


class SuggestionRejeterResponse(BaseModel):
    """Résultat du rejet d'une suggestion."""
    suggestion_id: int
    statut: str


# ============================================================
# RF-27 — Résumé de projet
# ============================================================

class ResumeResponse(BaseModel):
    """Résumé d'avancement d'un projet (RF-27)."""
    analyse_id: int
    resume: str
    avancement_estime: Optional[float] = None
    points_forts: List[str] = Field(default_factory=list)
    points_attention: List[str] = Field(default_factory=list)
    modele: str


# ============================================================
# RF-28 — Détection de retards / blocages
# ============================================================

class AlerteDetectee(BaseModel):
    """Une alerte détectée par l'IA (retard / blocage / risque)."""
    tache_id: Optional[int] = None
    tache_titre: Optional[str] = None
    type: str
    niveau: str = "info"
    message: str


class DetectionResponse(BaseModel):
    """Alertes détectées sur un projet (RF-28)."""
    analyse_id: int
    nombre_alertes: int
    alertes: List[AlerteDetectee] = Field(default_factory=list)
    modele: str


# ============================================================
# RF-29 — Proposition de statut santé
# ============================================================

class StatutProposeResponse(BaseModel):
    """Statut de santé proposé par l'IA (RF-29)."""
    analyse_id: int
    statut_propose: str  # vert | orange | rouge
    justification: str
    modele: str


# ============================================================
# RF-30 — Aide à l'affectation
# ============================================================

class AffectationSuggestion(BaseModel):
    """Un membre proposé pour une tâche, avec score (RF-30)."""
    utilisateur_id: int
    nom: str
    metier: Optional[str] = None
    score: int = 0
    justification: str = ""


class AffectationResponse(BaseModel):
    """Suggestions d'affectation pour une tâche (RF-30)."""
    analyse_id: int
    tache_titre: str
    suggestions: List[AffectationSuggestion] = Field(default_factory=list)
    note: Optional[str] = None
    modele: Optional[str] = None


# ============================================================
# RF-31 — Recherche dans le projet
# ============================================================

class ResultatRecherche(BaseModel):
    """Un résultat de recherche dans un projet (RF-31)."""
    type: str  # tache | commentaire | jalon | fichier
    id: int
    titre: str
    extrait: Optional[str] = None
    projet_id: int


class RechercheResponse(BaseModel):
    """Résultats de recherche dans un projet (RF-31)."""
    analyse_id: int
    requete: str
    nombre_resultats: int
    resultats: List[ResultatRecherche] = Field(default_factory=list)


# ============================================================
# Disponibilité des membres pour une date donnée
# ============================================================

class MembreDisponibilite(BaseModel):
    """Charge d'un membre autour d'une date donnée."""
    utilisateur_id: int
    nom: str
    metier: Optional[str] = None
    taches_ce_jour: int = Field(0, description="Tâches en cours avec échéance exacte ce jour")
    taches_fenetre: int = Field(0, description="Tâches en cours dans la fenêtre ±2 jours")
    disponible: bool = Field(True, description="True si le membre a peu de charge")