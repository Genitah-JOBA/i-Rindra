# app/routers/ia.py
"""
Routes IA — base du module.

Endpoints :
  - GET  /ia/status : état de la configuration (sans appel réseau) ;
  - POST /ia/ping   : test de bout en bout vers OpenAI (mini prompt) ;
  - POST /ia/chat   : conversation avec l'assistant IA ;
  - Fonctionnalités métier (RF-25 → RF-31) : analyse CDC, extraction de
    tâches, résumé, détection, statut proposé, affectation, recherche.
"""
from typing import List, Optional

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.projet import ProjetMembre
from app.models.tache import StatutTache, Tache
from app.models.utilisateur import Utilisateur
from app.routers.auth import get_current_user_id, get_current_user_role
from app.routers.projets import check_projet_access, check_direction_or_chef_projet
from app.schemas.ia import (
    IaPing,
    IaStatus,
    ChatRequest,
    ChatResponse,
    AnalyseCdcRequest,
    AnalyseCdcResponse,
    ExtractionRequest,
    ExtractionResponse,
    SuggestionItem,
    SuggestionValiderRequest,
    SuggestionValiderResponse,
    SuggestionRejeterResponse,
    ResumeResponse,
    DetectionResponse,
    StatutProposeResponse,
    AffectationResponse,
    MembreDisponibilite,
    RechercheResponse,
)
from app.routers.suggestion_devis import _sauvegarder_suggestion
from app.services.connectors.llm import (
    LLMConfigError,
    LLMProviderError,
    chat_completion,
)
from app.services.ia import (
    ContenuIndisponibleError,
    ReponseIAInvalideError,
    analyser_cdc,
    detecter_alertes,
    extraire_taches,
    lister_suggestions,
    proposer_statut,
    rejeter_suggestion,
    rechercher,
    resume_projet,
    suggerer_affectation,
    valider_suggestion,
)

router = APIRouter(prefix="/ia", tags=["IA"])

SYSTEM_PROMPT = (
    "Tu es l'assistant IA de la plateforme i-Rindra, un outil de gestion de projets "
    "pour l'agence Bienfe. Tu aides les utilisateurs (direction, DRH, chefs de "
    "projet, équipe) avec :\n"
    "- La planification et le suivi de projets\n"
    "- La gestion de tâches et le Kanban\n"
    "- L'analyse de deadlines et les risques de retard\n"
    "- Les résumés d'avancement\n"
    "- Les conseils sur l'organisation et la productivité\n\n"
    "Tu réponds de manière concise et professionnelle en français. "
    "Si on te pose une question hors sujet, redirige poliment vers les fonctionnalités de la plateforme."
)


def _erreur_ia(exc: Exception):
    """Normalise les erreurs du service IA en réponses HTTP propres."""
    if isinstance(exc, LLMConfigError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    if isinstance(exc, LLMProviderError):
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    if isinstance(exc, ContenuIndisponibleError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    if isinstance(exc, ReponseIAInvalideError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    raise exc


async def _pilote_ou_plus(role: str = Depends(get_current_user_role)):
    """L'IA consomme des crédits : réservée aux comptes internes."""
    if role not in ("direction", "drh", "chef_de_projet", "equipe"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux comptes internes.",
        )
    return role


# Mots-clés indiquant une demande de devis (volet financier).
_MOTS_DEVIS = [
    "devis", "tarif", "tarifer", "estimation", "soumission",
    "cotisation", "prix de", "coût de", "cout de", "combien ça coûte",
]


def _demande_de_devis(message: str) -> bool:
    """Détecte si un message de l'assistant est une demande de devis."""
    texte = message.lower().strip()
    return any(mot in texte for mot in _MOTS_DEVIS)


@router.get("/status", response_model=IaStatus)
async def ia_status(_: str = Depends(get_current_user_role)):
    """
    État de la configuration IA.

    Rapide, aucun appel réseau : indique si la clé est configurée
    et le modèle sélectionné pour les appels.
    """
    return IaStatus(
        configuree=bool(settings.OPENAI_API_KEY),
        modele=settings.OPENAI_MODEL,
    )


@router.post("/ping", response_model=IaPing)
async def ia_ping(_: str = Depends(_pilote_ou_plus)):
    """
    Test de bout en bout : envoie un mini prompt à OpenAI.

    Vérifie la clé, la connectivité et le modèle configuré.
    Renvoie la réponse brute (texte) et le modèle réellement utilisé.
    """
    try:
        resultat = await chat_completion(
            system="Tu réponds en un mot, sans ponctuation.",
            user="Dis OK si tu me lis.",
            temperature=0.0,
            max_tokens=5,
        )
    except LLMConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return IaPing(
        ok=True,
        reponse=resultat.content.strip()[:100],
        modele=resultat.modele,
        tokens=resultat.tokens,
    )


@router.post("/chat", response_model=ChatResponse)
async def ia_chat(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    role: str = Depends(_pilote_ou_plus),
):
    """
    Conversation avec l'assistant IA.

    Accepte un message + un historique optionnel (max 20 messages).
    Le system prompt contextualise l'assistant dans l'écosystème i-Rindra.

    Spécialité volet financier : si la direction/DRH demande un devis
    (mot-clé "devis", "tarif", "estimation"...), la réponse est automatiquement
    sauvegardée dans "Suggestion devis par IA" (table suggestion_devis).
    """
    # Construit la liste des messages pour l'API OpenAI
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Ajoute l'historique (tronqué aux 20 derniers pour limiter les tokens)
    if data.historique:
        for msg in data.historique[-20:]:
            if msg.role in ("user", "assistant"):
                messages.append({"role": msg.role, "content": msg.content})

    # Ajoute le message courant
    messages.append({"role": "user", "content": data.message})

    try:
        resultat = await chat_completion(
            messages=messages,
            temperature=0.5,
            max_tokens=1024,
        )
    except LLMConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    # Sauvegarde automatique si la direction/DRH demande un devis
    suggestion_devis_sauvee = False
    if role in ("direction", "drh") and _demande_de_devis(data.message):
        try:
            await _sauvegarder_suggestion(
                db,
                contenu_devis=resultat.content.strip(),
                demande=data.message,
                modele=resultat.modele,
                cree_par=user_id,
            )
            suggestion_devis_sauvee = True
        except Exception:
            # La sauvegarde ne doit jamais bloquer la conversation.
            suggestion_devis_sauvee = False

    return ChatResponse(
        reponse=resultat.content.strip(),
        modele=resultat.modele,
        tokens=resultat.tokens,
        suggestion_devis_sauvee=suggestion_devis_sauvee,
    )


# ============================================================
# RF-25 — Analyse du cahier des charges
# ============================================================

@router.post("/projets/{projet_id}/analyser-cdc", response_model=AnalyseCdcResponse)
async def ia_analyser_cdc(
    projet_id: int,
    data: AnalyseCdcRequest,
    projet: object = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet),
):
    """
    Analyse le cahier des charges d'un projet (RF-25).

    Source du texte, dans l'ordre :
      1. le paramètre `texte` de la requête ;
      2. le fichier CDC (txt/md/csv) joint au projet ;
      3. la description du projet.

    Réservé à la direction, au DRH et aux chefs de projet.
    """
    try:
        return await analyser_cdc(db, projet_id, texte=data.texte)
    except Exception as exc:
        _erreur_ia(exc)


# ============================================================
# RF-26 — Extraction de tâches & suggestions
# ============================================================

@router.post("/projets/{projet_id}/extraire-taches", response_model=ExtractionResponse)
async def ia_extraire_taches(
    projet_id: int,
    data: ExtractionRequest,
    projet: object = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet),
):
    """
    Extrait des suggestions de tâches depuis le cahier des charges (RF-26).

    L'IA propose → l'humain valide : aucune vraie Tache n'est créée ici.
    Les suggestions sont stockées en attente (`/ia/suggestions`).
    """
    try:
        return await extraire_taches(db, projet_id, texte=data.texte)
    except Exception as exc:
        _erreur_ia(exc)


@router.get("/suggestions", response_model=List[SuggestionItem])
async def ia_lister_suggestions(
    projet_id: Optional[int] = Query(None, description="Filtrer par projet"),
    statut: str = Query(
        default="en_attente",
        pattern="^(en_attente|validee|rejetee|tous)$",
        description="Statut des suggestions",
    ),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_pilote_ou_plus),
):
    """
    Liste les suggestions de tâches proposées par l'IA.
    Par défaut : seulement celles en attente de validation.
    """
    try:
        return await lister_suggestions(db, projet_id=projet_id, statut=statut)
    except Exception as exc:
        _erreur_ia(exc)


@router.post("/suggestions/{suggestion_id}/valider", response_model=SuggestionValiderResponse)
async def ia_valider_suggestion(
    suggestion_id: int,
    data: SuggestionValiderRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet),
):
    """
    Valide une suggestion : crée la vraie Tache dans le Kanban (RF-26, RF-15).
    La suggestion passe à l'état 'validee' et pointe vers la tâche créée.
    """
    try:
        return await valider_suggestion(db, suggestion_id, responsable_id=data.responsable_id)
    except Exception as exc:
        _erreur_ia(exc)


@router.post("/suggestions/{suggestion_id}/rejeter", response_model=SuggestionRejeterResponse)
async def ia_rejeter_suggestion(
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet),
):
    """Rejette une suggestion de tâche (RF-26)."""
    try:
        return await rejeter_suggestion(db, suggestion_id)
    except Exception as exc:
        _erreur_ia(exc)


# ============================================================
# RF-27 — Résumé de projet
# ============================================================

@router.post("/projets/{projet_id}/resume", response_model=ResumeResponse)
async def ia_resume_projet(
    projet_id: int,
    projet: object = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_pilote_ou_plus),
):
    """
    Résumé d'avancement d'un projet par l'IA (RF-27).

    Accessible à tout compte interne.
    """
    try:
        return await resume_projet(db, projet_id)
    except Exception as exc:
        _erreur_ia(exc)


# ============================================================
# RF-28 — Détection de retards / blocages
# ============================================================

@router.post("/projets/{projet_id}/detection", response_model=DetectionResponse)
async def ia_detection_alertes(
    projet_id: int,
    projet: object = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet),
):
    """
    Détecte les retards, blocages et risques d'un projet (RF-28).
    Réservé à la direction, au DRH et aux chefs de projet.
    """
    try:
        return await detecter_alertes(db, projet_id)
    except Exception as exc:
        _erreur_ia(exc)


# ============================================================
# RF-29 — Proposition de statut santé
# ============================================================

@router.post("/projets/{projet_id}/statut-propose", response_model=StatutProposeResponse)
async def ia_statut_propose(
    projet_id: int,
    projet: object = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet),
):
    """
    Propose un statut de santé (vert / orange / rouge) pour le projet (RF-29).
    La proposition reste à valider manuellement via la fiche projet.

    Réservé à la direction, au DRH et aux chefs de projet.
    """
    try:
        return await proposer_statut(db, projet_id)
    except Exception as exc:
        _erreur_ia(exc)


# ============================================================
# RF-30 — Aide à l'affectation
# ============================================================

@router.post("/taches/{tache_id}/affectation", response_model=AffectationResponse)
async def ia_affectation(
    tache_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(check_direction_or_chef_projet),
):
    """
    Suggère les membres les plus adaptés pour une tâche (RF-30).
    Se base sur les membres affectés au projet et leur métier.

    Réservé à la direction, au DRH et aux chefs de projet.
    """
    try:
        return await suggerer_affectation(db, tache_id)
    except Exception as exc:
        _erreur_ia(exc)


# ============================================================
# RF-31 — Recherche dans le projet
# ============================================================

@router.get("/projets/{projet_id}/recherche", response_model=RechercheResponse)
async def ia_recherche(
    projet_id: int,
    q: str = Query(..., min_length=2, description="Texte à rechercher"),
    projet: object = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_pilote_ou_plus),
):
    """
    Recherche dans un projet : tâches, commentaires, jalons, fichiers (RF-31).

    Recherche plein texte pour l'instant. La recherche vectorielle
    (pgvector + embeddings) sera branchée par-dessus quand l'extension
    sera disponible sans changer cet endpoint.

    Accessible à tout compte interne.
    """
    try:
        return await rechercher(db, projet_id, q)
    except Exception as exc:
        _erreur_ia(exc)


@router.get(
    "/projets/{projet_id}/disponibilites",
    response_model=List[MembreDisponibilite],
)
async def ia_disponibilites(
    projet_id: int,
    date_cible: date = Query(..., alias="date", description="Date cible YYYY-MM-DD"),
    projet: object = Depends(check_projet_access),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_pilote_ou_plus),
):
    """
    Charge de chaque membre autour de la date cible (±2 jours).
    Un membre est « disponible » s'il n'a aucune tâche due exactement
    ce jour et moins de 3 tâches dans la fenêtre ±2 jours.
    """
    date_debut = date_cible - timedelta(days=2)
    date_fin = date_cible + timedelta(days=2)

    # Membres du projet avec leurs infos utilisateur
    membres_result = await db.execute(
        select(Utilisateur.id, Utilisateur.nom, Utilisateur.prenom, Utilisateur.metier)
        .join(ProjetMembre, ProjetMembre.utilisateur_id == Utilisateur.id)
        .where(ProjetMembre.projet_id == projet_id)
        .order_by(Utilisateur.nom)
    )
    membres = membres_result.all()

    # Pré-charger toutes les tâches non terminées de ces membres dans la fenêtre
    membres_ids = [m.id for m in membres]
    if not membres_ids:
        return []

    taches_result = await db.execute(
        select(
            Tache.responsable_id,
            Tache.echeance,
        ).where(
            Tache.projet_id == projet_id,
            Tache.responsable_id.in_(membres_ids),
            Tache.echeance.isnot(None),
            Tache.echeance >= date_debut,
            Tache.echeance <= date_fin,
            Tache.statut != StatutTache.TERMINE,
        )
    )
    taches = taches_result.all()

    # Comptage par membre
    compteurs: dict[int, dict[str, int]] = {
        uid: {"jour": 0, "fenetre": 0} for uid in membres_ids
    }
    for resp_id, ech in taches:
        if resp_id not in compteurs:
            continue
        compteurs[resp_id]["fenetre"] += 1
        if ech == date_cible:
            compteurs[resp_id]["jour"] += 1

    return [
        MembreDisponibilite(
            utilisateur_id=m.id,
            nom=f"{m.prenom} {m.nom}",
            metier=m.metier,
            taches_ce_jour=compteurs[m.id]["jour"],
            taches_fenetre=compteurs[m.id]["fenetre"],
            disponible=(
                compteurs[m.id]["jour"] == 0
                and compteurs[m.id]["fenetre"] < 3
            ),
        )
        for m in membres
    ]