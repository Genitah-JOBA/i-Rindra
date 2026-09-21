# app/services/ia.py
"""
Service IA — la logique métier du module IA (RF-25 à RF-31).

Règles d'or (cf. doc projet) :
  - jamais d'appel direct à OpenAI depuis un router : tout passe par
    `app.services.connectors.llm.chat_completion` ;
  - chaque traitement est journalisé dans `analyse_ia` (RNF-03) avec
    l'entrée « strict nécessaire » (tronquée) et le résultat brut ;
  - « l'IA propose, l'humain valide » (RF-15, RF-26) : l'extraction de
    tâches ne crée que des `SuggestionTache`, jamais de `Tache`.
"""
import json
import logging
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional, Tuple

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analyse_ia import (
    AnalyseIA,
    SuggestionTache,
    StatutSuggestion,
    TypeAnalyseIA,
)
from app.models.fichier import Fichier
from app.models.jalon import Jalon
from app.models.projet import Projet, ProjetMembre, StatutSante
from app.models.tache import Tache, StatutTache, PrioriteTache, CommentaireTache
from app.models.utilisateur import Utilisateur
from app.services.connectors.llm import chat_completion

logger = logging.getLogger(__name__)

# Taille max des entrées envoyées à l'IA (« strict nécessaire », RNF-03).
ENTREE_MAX = 6000
RESULTAT_MAX = 12000


class ContenuIndisponibleError(Exception):
    """Aucun cahier des charges / texte exploitable pour le traitement demandé."""


class ReponseIAInvalideError(Exception):
    """La réponse de l'IA n'a pas pu être interprétée (JSON absent ou mauvais schéma)."""


# ============================================================
# Helpers communs
# ============================================================

def _tronquer(texte: Optional[str], max_car: int = ENTREE_MAX) -> Optional[str]:
    if not texte:
        return texte
    return texte[:max_car]


def _iso(v):
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


def _json_extraire(reponse: str) -> dict:
    """Parse la réponse de l'IA. Supporte un bloc ```json ... ``` autour."""
    texte = reponse.strip()
    if texte.startswith("```"):
        lignes = texte.splitlines()
        if lignes and lignes[0].startswith("```"):
            lignes = lignes[1:]
        if lignes and lignes[-1].strip() == "```":
            lignes = lignes[:-1]
        texte = "\n".join(lignes).strip()
    return json.loads(texte)


async def _appel_json(db: AsyncSession, projet_id: int, type_analyse: TypeAnalyseIA,
                      system: str, user: str, source: Optional[str] = None,
                      temperature: float = 0.2, max_tokens: int = 2048) -> Tuple[dict, str, int]:
    """
    Appel unique à l'IA en mode JSON, puis journalisation dans analyse_ia.

    Retourne (donnees_json, modele, analyse_id).
    """
    resultat = await chat_completion(
        system=system,
        user=_tronquer(user),
        format="json",
        temperature=temperature,
        max_tokens=max_tokens,
    )
    try:
        donnees = _json_extraire(resultat.content)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Réponse IA non-JSON pour %s : %s", type_analyse, exc)
        raise ReponseIAInvalideError(
            "La réponse de l'IA n'est pas un JSON exploitable. Réessayez."
        ) from exc

    analyse = await journaliser(
        db,
        projet_id=projet_id,
        type_analyse=type_analyse,
        entree=user,
        source=source,
        resultat=resultat.content,
        modele=resultat.modele,
    )
    return donnees, resultat.modele, analyse.id


async def journaliser(db: AsyncSession, projet_id: Optional[int],
                      type_analyse: TypeAnalyseIA, entree: Optional[str],
                      source: Optional[str] = None,
                      resultat: Optional[str] = None,
                      modele: Optional[str] = None) -> AnalyseIA:
    """Trace un traitement IA dans `analyse_ia` (exigence RNF-03)."""
    analyse = AnalyseIA(
        projet_id=projet_id,
        type=type_analyse,
        source=_tronquer(source, 500),
        entree=_tronquer(entree),
        resultat_json=_resultat_brut(resultat),
        modele=modele,
    )
    db.add(analyse)
    await db.commit()
    await db.refresh(analyse)
    return analyse


def _resultat_brut(content: str):
    """Stocke le résultat brut de façon sérialisable, tronqué."""
    if not content:
        return None
    try:
        return json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return {"reponse": _tronquer(content, RESULTAT_MAX)}


def _priorite_valide(v) -> str:
    if v in (PrioriteTache.HAUTE.value, PrioriteTache.MOYENNE.value, PrioriteTache.BASSE.value):
        return v
    return PrioriteTache.MOYENNE.value


def _statut_valide(v) -> Optional[str]:
    if v in (StatutSante.VERT.value, StatutSante.ORANGE.value, StatutSante.ROUGE.value):
        return v
    return None


def _echeance_valide(v) -> Optional[date]:
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except (ValueError, TypeError):
        return None


def _echeance_future(v) -> Optional[date]:
    """Accepte une date parseable ; toute date passée est ramenée à aujourd'hui."""
    d = _echeance_valide(v)
    if not d:
        return None
    return date.today() if d < date.today() else d


# ============================================================
# Récupération des données projet
# ============================================================

async def _projet(db: AsyncSession, projet_id: int) -> Projet:
    res = await db.execute(select(Projet).where(Projet.id == projet_id))
    return res.scalar_one_or_none()


async def _taches(db: AsyncSession, projet_id: int) -> List[Tache]:
    res = await db.execute(
        select(Tache).where(Tache.projet_id == projet_id).order_by(Tache.ordre)
    )
    return list(res.scalars().all())


async def _texte_cdc_projet(db: AsyncSession, projet_id: int) -> Tuple[Optional[str], Optional[str]]:
    """
    Récupère le contenu d'un cahier des charges joint au projet (RF-25/RF-26).

    Lit les fichiers texte (txt/md/csv) du projet. Retourne (texte, nom_fichier).
    Les PDF/Word ne sont pas encore parsés (à brancher plus tard).
    """
    res = await db.execute(select(Fichier).where(Fichier.projet_id == projet_id))
    fichiers = res.scalars().all()
    for f in fichiers or []:
        nom = (f.nom or "").lower()
        if nom.endswith((".txt", ".md", ".csv")):
            try:
                chemin = Path(f.chemin_ou_url)
                if chemin.exists():
                    texte = chemin.read_text(encoding="utf-8", errors="ignore")
                    return _tronquer(texte), f.nom
            except Exception as exc:
                logger.warning("Lecture CDC impossible (%s) : %s", f.nom, exc)
    return None, None


async def _contexte_projet(db: AsyncSession, projet: Projet) -> str:
    """Descriptif compact d'un projet pour l'injecter dans les prompts."""
    taches = await _taches(db, projet.id)
    res = await db.execute(select(Jalon).where(Jalon.projet_id == projet.id))
    jalons = res.scalars().all()

    lignes = [
        f"Nom : {projet.nom}",
        f"Description : {projet.description or '(aucune)'}",
        f"Client (id) : {projet.client_id}",
        f"Dates : {_iso(projet.date_debut)} → {_iso(projet.date_fin_prevue)}",
        f"Avancement : {projet.avancement_pct}% — santé actuelle : {projet.statut_sante.value}",
    ]
    if jalons:
        lignes.append("Jalons : " + "; ".join(
            f"{j.titre} ({'atteint' if j.atteint else 'échéance ' + str(j.echeance)})"
            for j in jalons
        ))
    if taches:
        lignes.append("Tâches :")
        for t in taches:
            responsable = f"resp={t.responsable_id}"
            echeance = f", échéance={t.echeance}" if t.echeance else ""
            lignes.append(
                f"- [{t.id}] {t.titre} — {t.statut.value}, priorité {t.priorite.value} "
                f"({responsable}{echeance})"
            )
    else:
        lignes.append("Tâches : (aucune)")
    return "\n".join(lignes)


@dataclass
class ContexteUtilisateur:
    """Contexte du chat : texte injectable dans le prompt + compteurs pour l'UI."""
    texte: str = ""
    nb_projets: int = 0
    nb_taches: int = 0


def _lignes_contexte(projets, taches, utilisateur_id: int) -> List[str]:
    """
    Rend un bloc de contexte des projets / tâches visibles (chat contextuel).

    Met en avant : les tâches de l'utilisateur, les tâches en retard et les
    prochaines échéances. N'invente rien : tout provient des objets fournis.
    """
    par_projet: dict[int, List[Tache]] = {}
    for t in taches:
        par_projet.setdefault(t.projet_id, []).append(t)

    lignes: List[str] = [
        "Voici le contexte réel de l'utilisateur sur la plateforme i-Rindra "
        "(projets actifs et tâches associées). Réponds en t'appuyant sur ces "
        "données exactes — ne les invente pas et ne les contredis pas :"
    ]
    for p in projets:
        ts = par_projet.get(p.id, [])
        en_retard = [t for t in ts if t.echeance and t.echeance < date.today()]
        a_venir = sorted(
            (t for t in ts if t.echeance and t.echeance >= date.today()),
            key=lambda t: t.echeance,
        )
        mes = [t for t in ts if t.responsable_id == utilisateur_id]

        lignes.append(
            f"- [{p.id}] {p.nom} — santé {p.statut_sante.value}, avancement "
            f"{p.avancement_pct}% ({len(ts)} tâche(s) en cours) ; "
            f"{_iso(p.date_debut) or '?'} → {_iso(p.date_fin_prevue) or '?'}"
        )

        details: List[str] = []
        vues: set = set()

        def ajouter(t, libelle: str):
            if t.id in vues:
                return
            vues.add(t.id)
            details.append(
                f"{libelle} #{t.id} « {t.titre} » — {t.statut.value}, "
                f"priorité {t.priorite.value}, échéance {_iso(t.echeance) or 'sans'}"
            )

        for t in mes[:2]:
            ajouter(t, "tâche de l'utilisateur")
        for t in en_retard[:3]:
            ajouter(t, "EN RETARD")
        for t in a_venir[:2]:
            ajouter(t, "échéance à venir")

        if details:
            lignes.append("    * " + "\n    * ".join(details))

    return lignes


async def contexte_utilisateur(db: AsyncSession, utilisateur_id: int,
                               role: str,
                               client_id: Optional[int] = None) -> ContexteUtilisateur:
    """
    Synthèse des projets / tâches réellement accessibles à un utilisateur,
    à injecter dans le prompt système du chat (chat contextuel).

    La visibilité suit les mêmes règles que `/projets` : la direction, le DRH
    et les chefs de projet voient tout ; « equipe » voit ses projets ; un client
    voit uniquement les projets de son client_id.
    """
    query = select(Projet).where(Projet.archive.is_(False))
    if role in ("direction", "drh", "chef_de_projet"):
        pass
    elif role == "equipe":
        sous_equipe = select(ProjetMembre.projet_id).where(
            ProjetMembre.utilisateur_id == utilisateur_id
        )
        query = query.where(
            or_(
                Projet.responsable_id == utilisateur_id,
                Projet.id.in_(sous_equipe),
            )
        )
    elif client_id:
        query = query.where(Projet.client_id == client_id)
    else:
        return ContexteUtilisateur(texte="Aucun projet accessible pour cet utilisateur.")

    res = await db.execute(query.order_by(Projet.cree_le.desc()).limit(8))
    projets = list(res.scalars().all())
    if not projets:
        return ContexteUtilisateur(texte="Aucun projet actif pour cet utilisateur.")

    res = await db.execute(
        select(Tache).where(
            Tache.projet_id.in_([p.id for p in projets]),
            Tache.statut != StatutTache.TERMINE,
        )
    )
    taches = list(res.scalars().all())

    texte = _tronquer("\n".join(_lignes_contexte(projets, taches, utilisateur_id)), ENTREE_MAX)
    return ContexteUtilisateur(texte=texte, nb_projets=len(projets), nb_taches=len(taches))


async def _entree_cdc(db, projet: Projet, texte: Optional[str]) -> Tuple[str, Optional[str]]:
    """Détermine le texte source pour l'analyse CDC / extraction de tâches."""
    source = None
    entree = texte
    if not entree:
        entree, source = await _texte_cdc_projet(db, projet.id)
        if not entree:
            entree = projet.description
            source = "description_projet"
    return entree, source


# ============================================================
# RF-25 — Analyse du cahier des charges
# ============================================================

SYSTEM_CDC = (
    "Tu es un expert en pilotage de projets. On te fournit un cahier des charges. "
    "Réponds en français avec UNIQUEMENT un objet JSON valide au format : "
    '{"points_cles": ["..."], "perimetre": "résumé du périmètre", '
    '"risques": ["..."], "recommandations": ["..."]}.'
)


async def analyser_cdc(db: AsyncSession, projet_id: int, texte: Optional[str] = None) -> dict:
    """Analyse le cahier des charges d'un projet et renvoie une synthèse exploitable (RF-25)."""
    projet = await _projet(db, projet_id)
    entree, source = await _entree_cdc(db, projet, texte)
    if not entree:
        raise ContenuIndisponibleError(
            "Aucun cahier des charges trouvé. Importez un fichier texte (txt/md/csv) "
            "dans le projet ou passez le paramètre `texte`."
        )

    donnees, modele, analyse_id = await _appel_json(
        db,
        projet_id=projet_id,
        type_analyse=TypeAnalyseIA.ANALYSE_CDC,
        source=source,
        system=SYSTEM_CDC,
        user=f"Cahier des charges du projet « {projet.nom} » :\n\n{entree}",
        temperature=0.2,
    )
    return {
        "analyse_id": analyse_id,
        "points_cles": donnees.get("points_cles", []),
        "perimetre": donnees.get("perimetre", ""),
        "risques": donnees.get("risques", []),
        "recommandations": donnees.get("recommandations", []),
        "modele": modele,
    }


# ============================================================
# RF-26 — Extraction de tâches (IA propose → humain valide)
# ============================================================

SYSTEM_EXTRACTION = (
    "Tu es un expert en découpage de projets. À partir du cahier des charges fourni, "
    "découpe le travail en tâches unitaires et opérationnelles. Réponds avec UNIQUEMENT "
    "un objet JSON valide au format : "
    '{"taches": [{"titre": "...", "description": "...", "priorite": "haute|moyenne|basse", '
    '"echeance": "AAAA-MM-JJ ou null"}]}. '
    "Attention : 'titre' court et actionnable (commence par un verbe), "
    "'description' précise le livrable attendu. "
    "'echeance' doit être une date FUTURE ou null : JAMAIS une date passée. "
    "Utilise 'echeance': null si tu ne connais aucune date."
)


@dataclass
class SuggestionTacheRecord:
    titre: str
    description: Optional[str]
    priorite: str
    echeance: Optional[date]


async def extraire_taches(db: AsyncSession, projet_id: int,
                          texte: Optional[str] = None) -> dict:
    """Extrait des suggestions de tâches depuis le CDC (aucune Tache créée) — RF-26."""
    projet = await _projet(db, projet_id)
    entree, source = await _entree_cdc(db, projet, texte)
    if not entree:
        raise ContenuIndisponibleError(
            "Aucun contenu à analyser. Importez le cahier des charges (txt/md/csv) "
            "ou passez le paramètre `texte`."
        )

    system = SYSTEM_EXTRACTION + (
        f"\nAujourd'hui : {date.today().isoformat()}. "
        f"Fenêtre prévue du projet : {_iso(projet.date_debut)} → {_iso(projet.date_fin_prevue)}. "
        "Les échéances proposées doivent se situer entre aujourd'hui et la fin du projet, "
        "dans la mesure du possible."
    )
    donnees, modele, analyse_id = await _appel_json(
        db,
        projet_id=projet_id,
        type_analyse=TypeAnalyseIA.EXTRACTION,
        source=source,
        system=system,
        user=f"Cahier des charges du projet « {projet.nom} » :\n\n{entree}",
        temperature=0.2,
        max_tokens=3000,
    )

    items = donnees.get("taches", []) or []
    suggestions: List[SuggestionTacheRecord] = []
    for item in items[:50]:
        if not isinstance(item, dict) or not item.get("titre"):
            continue
        suggestions.append(SuggestionTacheRecord(
            titre=str(item["titre"])[:200],
            description=str(item.get("description") or "")[:2000] or None,
            priorite=_priorite_valide(item.get("priorite")),
            echeance=_echeance_future(item.get("echeance")),
        ))

    if not suggestions:
        raise ReponseIAInvalideError("L'IA n'a renvoyé aucune tâche exploitable.")

    for s in suggestions:
        db.add(SuggestionTache(
            analyse_ia_id=analyse_id,
            projet_id=projet_id,
            titre=s.titre,
            description=s.description,
            priorite=s.priorite,
            echeance=s.echeance,
            statut=StatutSuggestion.EN_ATTENTE,
        ))
    await db.commit()

    return {
        "analyse_id": analyse_id,
        "projet": projet.nom,
        "nombre_suggestions": len(suggestions),
        "suggestions": [
            {
                "titre": s.titre,
                "description": s.description,
                "priorite": s.priorite,
                "echeance": _iso(s.echeance),
            }
            for s in suggestions
        ],
        "modele": modele,
    }


async def lister_suggestions(db: AsyncSession, projet_id: Optional[int] = None,
                             statut: str = "en_attente") -> List[dict]:
    """
    Liste les suggestions de tâches.
    `statut` = "en_attente" (défaut) | "validee" | "rejetee" | "tous".
    """
    query = select(SuggestionTache).order_by(SuggestionTache.cree_le.desc())
    if projet_id:
        query = query.where(SuggestionTache.projet_id == projet_id)
    if statut != "tous":
        query = query.where(SuggestionTache.statut == statut)

    res = await db.execute(query)
    lignes = res.scalars().all()
    return [
        {
            "id": s.id,
            "projet_id": s.projet_id,
            "titre": s.titre,
            "description": s.description,
            "priorite": s.priorite,
            "echeance": _iso(s.echeance),
            "statut": s.statut,
            "tache_id": s.tache_id,
            "cree_le": _iso(s.cree_le),
        }
        for s in lignes
    ]


async def _max_ordre(db: AsyncSession, projet_id: int) -> int:
    res = await db.execute(
        select(func.max(Tache.ordre)).where(
            and_(Tache.projet_id == projet_id, Tache.statut == StatutTache.A_FAIRE)
        )
    )
    return res.scalar_one_or_none() or 0


async def _maj_avancement(db: AsyncSession, projet_id: int) -> None:
    """Recalcule l'avancement d'un projet depuis ses tâches (RF-09)."""
    res = await db.execute(
        select(func.count(Tache.id)).where(Tache.projet_id == projet_id)
    )
    total = res.scalar_one_or_none() or 1
    res = await db.execute(
        select(func.count(Tache.id)).where(
            and_(Tache.projet_id == projet_id, Tache.statut == StatutTache.TERMINE)
        )
    )
    termine = res.scalar_one_or_none() or 0
    projet = await _projet(db, projet_id)
    if projet:
        projet.avancement_pct = round((termine / total) * 100, 1)
        await db.commit()


async def valider_suggestion(db: AsyncSession, suggestion_id: int, responsable_id: Optional[int] = None) -> dict:
    """Valide une suggestion : crée la vraie Tache et lie les deux (RF-26, RF-15)."""
    res = await db.execute(select(SuggestionTache).where(SuggestionTache.id == suggestion_id))
    suggestion = res.scalar_one_or_none()
    if not suggestion:
        raise ValueError("Suggestion introuvable.")
    if suggestion.statut != StatutSuggestion.EN_ATTENTE.value:
        raise ValueError("Cette suggestion n'est pas en attente (déjà traitée).")

    if responsable_id:
        res = await db.execute(select(Utilisateur).where(Utilisateur.id == responsable_id))
        if not res.scalar_one_or_none():
            raise ValueError("Responsable introuvable.")

    nouvelle = Tache(
        titre=suggestion.titre,
        description=suggestion.description,
        projet_id=suggestion.projet_id,
        statut=StatutTache.A_FAIRE,
        priorite=suggestion.priorite,
        echeance=suggestion.echeance,
        responsable_id=responsable_id,
        ordre=(await _max_ordre(db, suggestion.projet_id)) + 1,
    )
    db.add(nouvelle)
    await db.flush()

    suggestion.statut = StatutSuggestion.VALIDEE
    suggestion.tache_id = nouvelle.id
    await db.commit()
    await db.refresh(nouvelle)

    await _maj_avancement(db, suggestion.projet_id)

    return {
        "suggestion_id": suggestion.id,
        "tache_id": nouvelle.id,
        "titre": nouvelle.titre,
        "statut": suggestion.statut,
    }


async def rejeter_suggestion(db: AsyncSession, suggestion_id: int) -> dict:
    """Rejette une suggestion de tâche (RF-26)."""
    res = await db.execute(select(SuggestionTache).where(SuggestionTache.id == suggestion_id))
    suggestion = res.scalar_one_or_none()
    if not suggestion:
        raise ValueError("Suggestion introuvable.")
    if suggestion.statut != StatutSuggestion.EN_ATTENTE.value:
        raise ValueError("Cette suggestion n'est pas en attente (déjà traitée).")
    suggestion.statut = StatutSuggestion.REJETEE
    await db.commit()
    return {"suggestion_id": suggestion.id, "statut": suggestion.statut}


# ============================================================
# RF-27 — Résumé de projet
# ============================================================

SYSTEM_RESUME = (
    "Tu es un expert en suivi de projets. Résume l'état d'un projet pour sa direction. "
    "Réponds en français avec UNIQUEMENT un objet JSON valide au format : "
    '{"resume": "synthèse concise en 5 à 8 phrases", '
    '"avancement_estime": 0-100, "points_forts": ["..."], "points_attention": ["..."]}.'
)


async def resume_projet(db: AsyncSession, projet_id: int) -> dict:
    projet = await _projet(db, projet_id)
    contexte = await _contexte_projet(db, projet)

    donnees, modele, analyse_id = await _appel_json(
        db,
        projet_id=projet_id,
        type_analyse=TypeAnalyseIA.RESUME,
        system=SYSTEM_RESUME,
        user=f"Fais un résumé de ce projet :\n\n{contexte}",
        temperature=0.3,
        max_tokens=1024,
    )
    return {
        "analyse_id": analyse_id,
        "resume": donnees.get("resume", ""),
        "avancement_estime": donnees.get("avancement_estime", projet.avancement_pct),
        "points_forts": donnees.get("points_forts", []),
        "points_attention": donnees.get("points_attention", []),
        "modele": modele,
    }


# ============================================================
# RF-28 — Détection de retards / blocages
# ============================================================

SYSTEM_DETECTION = (
    "Tu es un expert en gestion de risques projet. Analyse les tâches fournies et "
    "détecte les retards, blocages et risques. Réponds en français avec UNIQUEMENT "
    "un objet JSON valide au format : "
    '{"alertes": [{"tache_id": <id ou null>, "tache_titre": "...", '
    '"type": "retard|blocage|risque|attention", "niveau": "info|warning|critique", '
    '"message": "explication concrète"}]}. '
    "N'invente pas de contexte absent des données."
)


async def detecter_alertes(db: AsyncSession, projet_id: int) -> dict:
    projet = await _projet(db, projet_id)
    contexte = await _contexte_projet(db, projet)

    donnees, modele, analyse_id = await _appel_json(
        db,
        projet_id=projet_id,
        type_analyse=TypeAnalyseIA.DETECTION,
        system=SYSTEM_DETECTION,
        user=f"Détecte les retards et blocages du projet « {projet.nom} » :\n\n{contexte}",
        temperature=0.2,
        max_tokens=2048,
    )
    alertes = donnees.get("alertes", []) or []
    return {
        "analyse_id": analyse_id,
        "nombre_alertes": len(alertes),
        "alertes": alertes,
        "modele": modele,
    }


# ============================================================
# RF-29 — Proposition de statut santé
# ============================================================

SYSTEM_STATUT = (
    "Tu es un expert en pilotage de projets. À partir de l'état du projet, propose "
    "un statut de santé parmi 'vert', 'orange' ou 'rouge'. Réponds avec UNIQUEMENT "
    "un objet JSON valide au format : "
    '{"statut_propose": "vert|orange|rouge", "justification": "explication concise '
    'des raisons de ce statut (dates, retards, avancement, tâches bloquées)"}.'
)


async def proposer_statut(db: AsyncSession, projet_id: int) -> dict:
    projet = await _projet(db, projet_id)
    contexte = await _contexte_projet(db, projet)

    donnees, modele, analyse_id = await _appel_json(
        db,
        projet_id=projet_id,
        type_analyse=TypeAnalyseIA.STATUT,
        system=SYSTEM_STATUT,
        user=f"Propose le statut de santé du projet « {projet.nom} » :\n\n{contexte}",
        temperature=0.2,
        max_tokens=1024,
    )
    statut = _statut_valide(str(donnees.get("statut_propose") or "").lower())
    if not statut:
        raise ReponseIAInvalideError("Statut proposé invalide par l'IA.")
    return {
        "analyse_id": analyse_id,
        "statut_propose": statut,
        "justification": donnees.get("justification", ""),
        "modele": modele,
    }


# ============================================================
# RF-30 — Aide à l'affectation
# ============================================================

SYSTEM_AFFECTATION = (
    "Tu es un expert en gestion des ressources. Pour la tâche donnée, propose les "
    "membres de l'équipe projet les plus adaptés (compétences / métier). Réponds "
    "avec UNIQUEMENT un objet JSON valide au format : "
    '{"suggestions": [{"utilisateur_id": <id>, "score": 0-100, "justification": "..."}]}. '
    "Classe les suggestions par score décroissant (max 3). N'utilise QUE les "
    "utilisateurs fournis."
)


async def suggerer_affectation(db: AsyncSession, tache_id: int) -> dict:
    res = await db.execute(select(Tache).where(Tache.id == tache_id))
    tache = res.scalar_one_or_none()
    if not tache:
        raise ValueError("Tâche introuvable.")

    res = await db.execute(
        select(ProjetMembre, Utilisateur)
        .join(Utilisateur, Utilisateur.id == ProjetMembre.utilisateur_id)
        .where(ProjetMembre.projet_id == tache.projet_id)
    )
    membres = res.all()
    membres_ok = [
        {
            "utilisateur_id": u.id,
            "nom": f"{u.prenom} {u.nom}",
            "role": u.role.value,
            "metier": u.metier,
        }
        for _, u in membres
    ]

    entree = (
        f"Tâche : {tache.titre}\nDescription : {tache.description or '(aucune)'}\n"
        f"Priorité : {tache.priorite.value}\nÉchéance : {_iso(tache.echeance)}\n"
        f"Équipe disponible : "
        f"{json.dumps(membres_ok, ensure_ascii=False) if membres_ok else 'aucun membre'}"
    )

    if not membres_ok:
        analyse = await journaliser(
            db,
            projet_id=tache.projet_id,
            type_analyse=TypeAnalyseIA.AFFECTATION,
            source=f"tache:{tache.id}",
            entree=entree,
        )
        return {
            "analyse_id": analyse.id,
            "tache_titre": tache.titre,
            "suggestions": [],
            "note": "Aucun membre affecté au projet.",
            "modele": None,
        }

    donnees, modele, analyse_id = await _appel_json(
        db,
        projet_id=tache.projet_id,
        type_analyse=TypeAnalyseIA.AFFECTATION,
        source=f"tache:{tache.id}",
        system=SYSTEM_AFFECTATION,
        user=entree,
        temperature=0.2,
        max_tokens=1024,
    )

    ids_ok = {m["utilisateur_id"] for m in membres_ok}
    par_id = {m["utilisateur_id"]: m for m in membres_ok}

    suggestions = []
    for s in (donnees.get("suggestions", []) or [])[:3]:
        uid = s.get("utilisateur_id")
        if uid not in ids_ok:
            continue
        suggestions.append({
            "utilisateur_id": uid,
            "nom": par_id[uid]["nom"],
            "metier": par_id[uid]["metier"] or par_id[uid]["role"],
            "score": int(s.get("score") or 0),
            "justification": s.get("justification", ""),
        })

    return {
        "analyse_id": analyse_id,
        "tache_titre": tache.titre,
        "suggestions": suggestions,
        "note": None,
        "modele": modele,
    }


# ============================================================
# RF-31 — Recherche dans le projet (fallback texte, sans pgvector)
# ============================================================

async def rechercher(db: AsyncSession, projet_id: int, requete: str) -> dict:
    """Recherche plein texte (ILIKE) dans tâches, commentaires, jalons, fichiers.
    La recherche vectorielle (pgvector) sera branchée par-dessus quand l'extension
    sera disponible — l'endpoint reste compatible. (RF-31)"""
    motif = f"%{requete.strip()}%"
    resultats = []

    res = await db.execute(
        select(Tache).where(
            Tache.projet_id == projet_id,
            Tache.titre.ilike(motif) | Tache.description.ilike(motif),
        ).limit(20)
    )
    for t in res.scalars().all():
        resultats.append({
            "type": "tache", "id": t.id, "titre": t.titre,
            "extrait": t.description, "projet_id": projet_id,
        })

    res = await db.execute(
        select(CommentaireTache).join(Tache, Tache.id == CommentaireTache.tache_id).where(
            Tache.projet_id == projet_id,
            CommentaireTache.contenu.ilike(motif),
        ).limit(20)
    )
    for c in res.scalars().all():
        resultats.append({
            "type": "commentaire", "id": c.id,
            "titre": f"Commentaire sur la tâche #{c.tache_id}",
            "extrait": c.contenu, "projet_id": projet_id,
        })

    res = await db.execute(
        select(Jalon).where(
            Jalon.projet_id == projet_id,
            Jalon.titre.ilike(motif) | Jalon.description.ilike(motif),
        ).limit(20)
    )
    for j in res.scalars().all():
        resultats.append({
            "type": "jalon", "id": j.id, "titre": j.titre,
            "extrait": j.description, "projet_id": projet_id,
        })

    res = await db.execute(
        select(Fichier).where(
            Fichier.projet_id == projet_id,
            Fichier.nom.ilike(motif),
        ).limit(20)
    )
    for f in res.scalars().all():
        resultats.append({
            "type": "fichier", "id": f.id, "titre": f.nom,
            "extrait": f.type_mime, "projet_id": projet_id,
        })

    analyse = await journaliser(
        db,
        projet_id=projet_id,
        type_analyse=TypeAnalyseIA.RECHERCHE,
        source=f"requete:{requete.strip()}",
        entree=requete,
        resultat=f"{len(resultats)} résultat(s)",
    )
    return {
        "analyse_id": analyse.id,
        "requete": requete.strip(),
        "nombre_resultats": len(resultats),
        "resultats": resultats,
    }