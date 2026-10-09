# app/routers/suggestion_devis.py
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.core.database import get_db
from app.routers.auth import get_current_user_id, get_current_user_role
from app.models.client import Client
from app.models.projet import Projet, ProjetMembre
from app.models.suggestion_devis import SuggestionDevis, StatutSuggestionDevis
from app.schemas.suggestion_devis import (
    SuggestionDevisIARequest,
    SuggestionDevisCreate,
    SuggestionDevisResponse,
    SuggestionDevisStatutUpdate,
)
from app.services.devis_pdf import apercu_devis, generer_pdf_devis, numero_devis
from app.services.connectors.llm import (
    LLMConfigError,
    LLMProviderError,
    chat_completion,
)

router = APIRouter(prefix="/suggestion-devis", tags=["Suggestion devis IA"])


# ============================================================
# PERMISSION — devis suggérés par IA = direction / DRH uniquement
# ============================================================

async def _finance_seulement(role: str = Depends(get_current_user_role)):
    if role not in ("direction", "drh"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé à la direction ou au DRH (volet financier).",
        )
    return role


# ============================================================
# LECTURE — devis VALIDÉS consultables par l'équipe (« Devis & Estimations »)
#   - direction / DRH : tous les devis (inchangé) ;
#   - chef de projet  : devis validés de tous les projets (il voit tous les projets) ;
#   - équipe          : devis validés des seuls projets dont il est responsable ou membre.
# Générer, valider, refuser ou supprimer reste réservé à la direction / DRH.
# ============================================================

ROLES_FINANCE = ("direction", "drh")
ROLES_LECTURE = ROLES_FINANCE + ("chef_de_projet", "equipe")


async def _lecteur(
    role: str = Depends(get_current_user_role),
    user_id: int = Depends(get_current_user_id),
) -> tuple[str, int]:
    if role not in ROLES_LECTURE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé.")
    return role, user_id


def _projets_du_membre(user_id: int):
    """Sous-requête : identifiants des projets dont l'utilisateur est responsable ou membre."""
    return (
        select(Projet.id).where(Projet.responsable_id == user_id)
        .union(select(ProjetMembre.projet_id).where(ProjetMembre.utilisateur_id == user_id))
    )


def _filtrer_lecture(q, role: str, user_id: int):
    if role in ROLES_FINANCE:
        return q
    q = q.where(SuggestionDevis.statut == StatutSuggestionDevis.VALIDEE)
    if role == "equipe":
        q = q.where(SuggestionDevis.projet_id.in_(_projets_du_membre(user_id)))
    return q


async def _verifier_lecture(db: AsyncSession, s: SuggestionDevis, role: str, user_id: int) -> None:
    """404 (et non 403) pour un devis non consultable : on ne révèle pas son existence."""
    if role in ROLES_FINANCE:
        return
    introuvable = HTTPException(status_code=404, detail="Suggestion de devis non trouvée.")
    if s.statut != StatutSuggestionDevis.VALIDEE:
        raise introuvable
    if role == "equipe":
        projets = (await db.execute(_projets_du_membre(user_id))).scalars().all()
        if s.projet_id not in projets:
            raise introuvable


SYSTEM_PROMPT_DEVIS = (
    "Tu es un expert en rédaction de devis pour l'agence Bienfe (plateforme i-Rindra). "
    "Rédige un devis détaillé, clair et professionnel en français.\n"
    "Structure obligatoire du devis :\n"
    "- En-tête (agence Bienfe, numéro de devis, date, validité)\n"
    "- Description du client et du projet\n"
    "- Tableau des prestations : quantité, désignation, prix unitaire HT, total HT\n"
    "- Totaux : Total HT, TVA, Total TTC\n"
    "- Conditions de paiement et délais\n"
    "Si des informations manquent (prix, quantités, délais), propose une estimation "
    "raisonnable dans la devise ariary (Ar) et précise qu'elle est indicative.\n"
    "Réponds avec le texte du devis uniquement, sans commentaire introductif."
)


async def _sauvegarder_suggestion(
    db: AsyncSession,
    *,
    contenu_devis: str,
    demande: Optional[str] = None,
    titre: Optional[str] = None,
    client_id: Optional[int] = None,
    projet_id: Optional[int] = None,
    modele: Optional[str] = None,
    cree_par: Optional[int] = None,
) -> SuggestionDevis:
    """Crée une SuggestionDevis en base. Réutilisé par /ia/chat."""
    suggestion = SuggestionDevis(
        client_id=client_id,
        projet_id=projet_id,
        titre=titre,
        demande=demande,
        contenu_devis=contenu_devis,
        modele=modele,
        cree_par=cree_par,
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)
    return suggestion


async def _verifier_client_projet(
    db: AsyncSession,
    client_id: int,
    projet_id: int,
):
    """Vérifie que le client et le projet existent et que le projet
    appartient bien à ce client."""
    client = (
        await db.execute(select(Client).where(Client.id == client_id))
    ).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Client introuvable.")

    projet = (
        await db.execute(select(Projet).where(Projet.id == projet_id))
    ).scalar_one_or_none()
    if not projet:
        raise HTTPException(status_code=400, detail="Projet introuvable.")

    if projet.client_id != client_id:
        raise HTTPException(
            status_code=400,
            detail="Ce projet n'appartient pas au client sélectionné.",
        )

    return client, projet


def _to_response(
    s: SuggestionDevis,
    client_nom: Optional[str] = None,
    projet_nom: Optional[str] = None,
) -> SuggestionDevisResponse:
    return SuggestionDevisResponse(
        id=s.id,
        client_id=s.client_id,
        client_nom=client_nom,
        projet_id=s.projet_id,
        projet_nom=projet_nom,
        titre=s.titre,
        demande=s.demande,
        contenu_devis=s.contenu_devis,
        statut=s.statut.value if hasattr(s.statut, "value") else s.statut,
        modele=s.modele,
        cree_par=s.cree_par,
        cree_le=s.cree_le,
    )


# ------------------------------------------------------------
# LISTE - toutes les suggestions de devis
# ------------------------------------------------------------

@router.get("/", response_model=List[SuggestionDevisResponse])
async def lister_suggestions(
    statut: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    lecteur: tuple[str, int] = Depends(_lecteur),
):
    q = (
        select(SuggestionDevis, Client.nom, Projet.nom)
        .join(Client, SuggestionDevis.client_id == Client.id)
        .join(Projet, SuggestionDevis.projet_id == Projet.id)
    )
    if statut:
        try:
            statut_enum = StatutSuggestionDevis(statut)
        except ValueError:
            raise HTTPException(status_code=400, detail="Statut invalide.")
        q = q.where(SuggestionDevis.statut == statut_enum)
    q = _filtrer_lecture(q, *lecteur)
    q = q.order_by(SuggestionDevis.cree_le.desc(), SuggestionDevis.id.desc())

    rows = (await db.execute(q)).all()
    return [_to_response(s, client_nom, projet_nom) for (s, client_nom, projet_nom) in rows]


# ------------------------------------------------------------
# GÉNÉRATION PAR L'IA (bouton "Ajout devis par IA")
# ------------------------------------------------------------

@router.post("/ia", response_model=SuggestionDevisResponse)
async def generer_devis_ia(
    data: SuggestionDevisIARequest,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    _: str = Depends(_finance_seulement),
):
    client, projet = await _verifier_client_projet(db, data.client_id, data.projet_id)

    contexte = f"Client : {client.nom}\nProjet : {projet.nom}\n{data.demande}"
    if data.titre:
        contexte = f"Titre du devis : {data.titre}\n{contexte}"

    try:
        resultat = await chat_completion(
            system=SYSTEM_PROMPT_DEVIS,
            user=contexte,
            temperature=0.4,
            max_tokens=1500,
        )
    except LLMConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    suggestion = await _sauvegarder_suggestion(
        db,
        contenu_devis=resultat.content.strip(),
        demande=data.demande,
        titre=data.titre,
        client_id=data.client_id,
        projet_id=data.projet_id,
        modele=resultat.modele,
        cree_par=user_id,
    )

    return _to_response(suggestion, client.nom, projet.nom)


# ------------------------------------------------------------
# SAVE DIRECTE (création à partir d'une réponse IA déjà fournie)
# ------------------------------------------------------------

@router.post("/", response_model=SuggestionDevisResponse, status_code=status.HTTP_201_CREATED)
async def creer_suggestion(
    data: SuggestionDevisCreate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    _: str = Depends(_finance_seulement),
):
    client_nom = None
    projet_nom = None
    if data.client_id is not None:
        client = (
            await db.execute(select(Client).where(Client.id == data.client_id))
        ).scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=400, detail="Client introuvable.")
        client_nom = client.nom

    if data.projet_id is not None:
        projet = (
            await db.execute(select(Projet).where(Projet.id == data.projet_id))
        ).scalar_one_or_none()
        if not projet:
            raise HTTPException(status_code=400, detail="Projet introuvable.")
        projet_nom = projet.nom
        if data.client_id is not None and projet.client_id != data.client_id:
            raise HTTPException(
                status_code=400,
                detail="Ce projet n'appartient pas au client sélectionné.",
            )

    suggestion = await _sauvegarder_suggestion(
        db,
        contenu_devis=data.contenu_devis,
        demande=data.demande,
        titre=data.titre,
        client_id=data.client_id,
        projet_id=data.projet_id,
        modele=data.modele,
        cree_par=user_id,
    )

    return _to_response(suggestion, client_nom, projet_nom)


# ------------------------------------------------------------
# DÉTAIL
# ------------------------------------------------------------

@router.get("/{suggestion_id:int}", response_model=SuggestionDevisResponse)
async def obtenir_suggestion(
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_finance_seulement),
):
    row = (
        await db.execute(
            select(SuggestionDevis, Client.nom, Projet.nom)
            .join(Client, SuggestionDevis.client_id == Client.id)
            .join(Projet, SuggestionDevis.projet_id == Projet.id)
            .where(SuggestionDevis.id == suggestion_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion de devis non trouvée.")
    s, client_nom, projet_nom = row
    return _to_response(s, client_nom, projet_nom)


# ------------------------------------------------------------
# PDF ET APERÇU DU DEVIS (gabarit B-esti, charte i-Rindra)
# ------------------------------------------------------------

async def _devis_complet(db: AsyncSession, suggestion_id: int):
    row = (
        await db.execute(
            select(SuggestionDevis, Client, Projet.nom)
            .outerjoin(Client, SuggestionDevis.client_id == Client.id)
            .outerjoin(Projet, SuggestionDevis.projet_id == Projet.id)
            .where(SuggestionDevis.id == suggestion_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion de devis non trouvée.")
    return row


@router.get("/{suggestion_id:int}/apercu")
async def apercu_suggestion(
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
    lecteur: tuple[str, int] = Depends(_lecteur),
):
    """Données du devis telles qu'imprimées sur le PDF (affichage « Voir le détail »)."""
    s, client, projet_nom = await _devis_complet(db, suggestion_id)
    await _verifier_lecture(db, s, *lecteur)
    return {
        **apercu_devis(devis_id=s.id, contenu=s.contenu_devis, cree_le=s.cree_le,
                       devise=(client.devise if client else None) or "Ar"),
        "client": {
            "nom": client.nom if client else None,
            "contact": client.contact if client else None,
            "email": client.email if client else None,
            "telephone": client.telephone if client else None,
        },
        "projet_nom": projet_nom,
    }


@router.get("/{suggestion_id:int}/pdf")
async def pdf_suggestion(
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
    lecteur: tuple[str, int] = Depends(_lecteur),
):
    s, client, projet_nom = await _devis_complet(db, suggestion_id)
    await _verifier_lecture(db, s, *lecteur)
    pdf = generer_pdf_devis(
        devis_id=s.id,
        titre=s.titre,
        contenu=s.contenu_devis,
        statut=s.statut.value if hasattr(s.statut, "value") else str(s.statut),
        cree_le=s.cree_le,
        modele=s.modele,
        client_nom=client.nom if client else None,
        client_contact=client.contact if client else None,
        client_email=client.email if client else None,
        client_telephone=client.telephone if client else None,
        devise=(client.devise if client else None) or "Ar",
        projet_nom=projet_nom,
    )
    nom_fichier = f"devis-{numero_devis(s.id, s.cree_le).replace('/', '-')}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nom_fichier}"'},
    )


# ------------------------------------------------------------
# CHANGEMENT DE STATUT (valider / refuser)
# ------------------------------------------------------------

@router.patch("/{suggestion_id:int}/statut", response_model=SuggestionDevisResponse)
async def changer_statut_suggestion(
    suggestion_id: int,
    data: SuggestionDevisStatutUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_finance_seulement),
):
    row = (
        await db.execute(
            select(SuggestionDevis, Client.nom, Projet.nom)
            .join(Client, SuggestionDevis.client_id == Client.id)
            .join(Projet, SuggestionDevis.projet_id == Projet.id)
            .where(SuggestionDevis.id == suggestion_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion de devis non trouvée.")
    s, client_nom, projet_nom = row
    s.statut = StatutSuggestionDevis(data.statut.value)
    await db.commit()
    await db.refresh(s)
    return _to_response(s, client_nom, projet_nom)


# ------------------------------------------------------------
# SUPPRESSION
# ------------------------------------------------------------

@router.delete("/{suggestion_id:int}", status_code=status.HTTP_204_NO_CONTENT)
async def supprimer_suggestion(
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_finance_seulement),
):
    s = (
        await db.execute(select(SuggestionDevis).where(SuggestionDevis.id == suggestion_id))
    ).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Suggestion de devis non trouvée.")
    await db.delete(s)
    await db.commit()
    return None