# app/routers/factures.py
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app.core.database import get_db
from app.routers.auth import get_current_user_id, get_current_user_role
from app.models.facture import Facture, StatutFacture
from app.models.client import Client
from app.models.projet import Projet
from app.models.utilisateur import Utilisateur
from app.schemas.facture import (
    FactureCreate,
    FactureUpdate,
    FactureResponse,
    FactureStats,
    StatutUpdate,
)
from app.services import notifications as notif_service
from app.services.facture_pdf import generer_pdf_facture

router = APIRouter(prefix="/factures", tags=["Facturation"])


# ============================================================
# PERMISSION — volet financier = ADMIN uniquement (la direction
# n'a AUCUN accès à l'argent, cf. cahier des charges).
# ============================================================

async def _admin_seulement(role: str = Depends(get_current_user_role)):
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé à l'administrateur (volet financier).",
        )
    return role


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

_CENT = Decimal("0.01")


def _calc_montants(montant_ht, taux_tva):
    """Calcule (HT, taux, TVA, TTC) en Decimal arrondis au centime."""
    ht = Decimal(str(montant_ht)).quantize(_CENT, rounding=ROUND_HALF_UP)
    taux = Decimal(str(taux_tva)).quantize(_CENT, rounding=ROUND_HALF_UP)
    tva = (ht * taux / Decimal("100")).quantize(_CENT, rounding=ROUND_HALF_UP)
    ttc = (ht + tva).quantize(_CENT, rounding=ROUND_HALF_UP)
    return ht, taux, tva, ttc


async def _generer_numero(db: AsyncSession) -> str:
    """Numéro séquentiel par année : FAC-2026-0001, FAC-2026-0002, ..."""
    annee = date.today().year
    prefixe = f"FAC-{annee}-"
    res = await db.execute(
        select(func.count(Facture.id)).where(Facture.numero.like(f"{prefixe}%"))
    )
    seq = (res.scalar() or 0) + 1
    return f"{prefixe}{seq:04d}"


def _to_response(f: Facture, client_nom=None, projet_nom=None) -> FactureResponse:
    return FactureResponse(
        id=f.id,
        numero=f.numero,
        client_id=f.client_id,
        projet_id=f.projet_id,
        client_nom=client_nom,
        projet_nom=projet_nom,
        statut=f.statut.value if hasattr(f.statut, "value") else f.statut,
        date_emission=f.date_emission,
        date_echeance=f.date_echeance,
        montant_ht=float(f.montant_ht),
        taux_tva=float(f.taux_tva),
        montant_tva=float(f.montant_tva),
        montant_ttc=float(f.montant_ttc),
        notes=f.notes,
        cree_le=f.cree_le,
    )


async def _noms(db: AsyncSession, f: Facture):
    """Récupère le nom du client et du projet liés à une facture."""
    client_nom = None
    projet_nom = None
    if f.client_id:
        r = await db.execute(select(Client.nom).where(Client.id == f.client_id))
        client_nom = r.scalar_one_or_none()
    if f.projet_id:
        r = await db.execute(select(Projet.nom).where(Projet.id == f.projet_id))
        projet_nom = r.scalar_one_or_none()
    return client_nom, projet_nom


async def _notifier_client(db: AsyncSession, f: Facture, ancien, nouveau):
    """Notifie les comptes 'client' rattachés à la facture à chaque changement
    de statut — JAMAIS pour un brouillon. Une facture payée déclenche une
    notification avec lien de téléchargement du PDF."""
    if hasattr(ancien, "value"):
        ancien = ancien.value
    if hasattr(nouveau, "value"):
        nouveau = nouveau.value

    if nouveau == StatutFacture.BROUILLON.value or nouveau == ancien:
        return

    destinataires = await notif_service.ids_clients_du_projet(db, f.client_id)
    if not destinataires:
        return

    montant = f"{f.montant_ttc:.2f}"

    if nouveau == StatutFacture.PAYEE.value:
        await notif_service.notifier(
            db,
            destinataires,
            "facture_payee",
            f"Votre facture {f.numero} de {montant} EUR a été payée. "
            "Téléchargez la facture en PDF.",
            f"/factures/{f.id}/pdf",
        )
        return

    messages = {
        StatutFacture.ENVOYEE.value: "vous a été envoyée et est en attente de paiement.",
        StatutFacture.EN_RETARD.value: "est en retard de paiement.",
        StatutFacture.ANNULEE.value: "a été annulée.",
    }
    if nouveau in messages:
        await notif_service.notifier(
            db,
            destinataires,
            "facture_statut",
            f"Votre facture {f.numero} de {montant} EUR {messages[nouveau]}",
            None,
        )


# ------------------------------------------------------------
# STATISTIQUES (avant /{id} pour éviter la collision de route)
# ------------------------------------------------------------

@router.get("/statistiques", response_model=FactureStats)
async def statistiques(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_admin_seulement),
):
    total = (await db.execute(select(func.count(Facture.id)))).scalar() or 0

    ca = (
        await db.execute(
            select(func.coalesce(func.sum(Facture.montant_ttc), 0)).where(
                Facture.statut == StatutFacture.PAYEE
            )
        )
    ).scalar() or 0

    en_attente = (
        await db.execute(
            select(func.coalesce(func.sum(Facture.montant_ttc), 0)).where(
                Facture.statut.in_([StatutFacture.ENVOYEE, StatutFacture.EN_RETARD])
            )
        )
    ).scalar() or 0

    brouillons = (
        await db.execute(
            select(func.count(Facture.id)).where(
                Facture.statut == StatutFacture.BROUILLON
            )
        )
    ).scalar() or 0

    impayees = (
        await db.execute(
            select(func.count(Facture.id)).where(
                Facture.statut.in_([StatutFacture.ENVOYEE, StatutFacture.EN_RETARD])
            )
        )
    ).scalar() or 0

    return FactureStats(
        total_factures=total,
        ca_encaisse=float(ca),
        en_attente=float(en_attente),
        brouillons=brouillons,
        impayees=impayees,
    )


# ------------------------------------------------------------
# LISTE
# ------------------------------------------------------------

@router.get("/", response_model=List[FactureResponse])
async def lister_factures(
    statut: Optional[str] = Query(None),
    client_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_admin_seulement),
):
    q = (
        select(Facture, Client.nom, Projet.nom)
        .join(Client, Facture.client_id == Client.id)
        .outerjoin(Projet, Facture.projet_id == Projet.id)
    )
    if statut:
        q = q.where(Facture.statut == statut)
    if client_id:
        q = q.where(Facture.client_id == client_id)
    q = q.order_by(Facture.date_emission.desc(), Facture.id.desc())

    rows = (await db.execute(q)).all()
    return [_to_response(f, client_nom, projet_nom) for (f, client_nom, projet_nom) in rows]


# ------------------------------------------------------------
# DÉTAIL
# ------------------------------------------------------------

@router.get("/{facture_id:int}", response_model=FactureResponse)
async def obtenir_facture(
    facture_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_admin_seulement),
):
    f = (await db.execute(select(Facture).where(Facture.id == facture_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    client_nom, projet_nom = await _noms(db, f)
    return _to_response(f, client_nom, projet_nom)


# ------------------------------------------------------------
# PDF DE LA FACTURE (admin OU client concerné)
# ------------------------------------------------------------

@router.get("/{facture_id:int}/pdf")
async def pdf_facture(
    facture_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    role: str = Depends(get_current_user_role),
):
    f = (await db.execute(select(Facture).where(Facture.id == facture_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    if role != "admin":
        # Un compte client ne peut télécharger que les factures de son client.
        if role != "client":
            raise HTTPException(status_code=403, detail="Accès refusé.")
        u = (
            await db.execute(select(Utilisateur).where(Utilisateur.id == user_id))
        ).scalar_one_or_none()
        if not u or u.client_id != f.client_id:
            raise HTTPException(
                status_code=403, detail="Cette facture ne vous est pas destinée."
            )

    client_nom, projet_nom = await _noms(db, f)
    pdf = generer_pdf_facture(f, client_nom, projet_nom)
    filename = f"facture-{f.numero}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ------------------------------------------------------------
# CRÉATION
# ------------------------------------------------------------

@router.post("/", response_model=FactureResponse, status_code=status.HTTP_201_CREATED)
async def creer_facture(
    data: FactureCreate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    _: str = Depends(_admin_seulement),
):
    # Client obligatoire et existant
    client = (await db.execute(select(Client).where(Client.id == data.client_id))).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Client introuvable.")

    # Projet optionnel : s'il est fourni, il doit exister
    projet_nom = None
    if data.projet_id is not None:
        projet = (await db.execute(select(Projet).where(Projet.id == data.projet_id))).scalar_one_or_none()
        if not projet:
            raise HTTPException(status_code=400, detail="Projet introuvable.")
        projet_nom = projet.nom

    ht, taux, tva, ttc = _calc_montants(data.montant_ht, data.taux_tva)

    facture = Facture(
        numero=await _generer_numero(db),
        client_id=data.client_id,
        projet_id=data.projet_id,
        statut=StatutFacture.BROUILLON,
        date_emission=data.date_emission or date.today(),
        date_echeance=data.date_echeance,
        montant_ht=ht,
        taux_tva=taux,
        montant_tva=tva,
        montant_ttc=ttc,
        notes=data.notes,
        cree_par=user_id,
    )
    db.add(facture)
    await db.commit()
    await db.refresh(facture)
    return _to_response(facture, client.nom, projet_nom)


# ------------------------------------------------------------
# MISE À JOUR
# ------------------------------------------------------------

@router.put("/{facture_id:int}", response_model=FactureResponse)
async def modifier_facture(
    facture_id: int,
    data: FactureUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_admin_seulement),
):
    f = (await db.execute(select(Facture).where(Facture.id == facture_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    if data.client_id is not None:
        client = (await db.execute(select(Client).where(Client.id == data.client_id))).scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=400, detail="Client introuvable.")
        f.client_id = data.client_id

    if data.projet_id is not None:
        # projet_id = 0 -> détacher le projet
        if data.projet_id == 0:
            f.projet_id = None
        else:
            projet = (await db.execute(select(Projet).where(Projet.id == data.projet_id))).scalar_one_or_none()
            if not projet:
                raise HTTPException(status_code=400, detail="Projet introuvable.")
            f.projet_id = data.projet_id

    if data.date_emission is not None:
        f.date_emission = data.date_emission
    if data.date_echeance is not None:
        f.date_echeance = data.date_echeance
    if data.notes is not None:
        f.notes = data.notes
    ancien_statut = f.statut
    if data.statut is not None:
        f.statut = StatutFacture(data.statut.value)
        await _notifier_client(db, f, ancien_statut, f.statut)

    # Recalcule les montants si HT ou taux changent
    if data.montant_ht is not None or data.taux_tva is not None:
        nouveau_ht = data.montant_ht if data.montant_ht is not None else f.montant_ht
        nouveau_taux = data.taux_tva if data.taux_tva is not None else f.taux_tva
        ht, taux, tva, ttc = _calc_montants(nouveau_ht, nouveau_taux)
        f.montant_ht, f.taux_tva, f.montant_tva, f.montant_ttc = ht, taux, tva, ttc

    await db.commit()
    await db.refresh(f)
    client_nom, projet_nom = await _noms(db, f)
    return _to_response(f, client_nom, projet_nom)


# ------------------------------------------------------------
# CHANGEMENT DE STATUT (raccourci)
# ------------------------------------------------------------

@router.patch("/{facture_id:int}/statut", response_model=FactureResponse)
async def changer_statut(
    facture_id: int,
    data: StatutUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_admin_seulement),
):
    f = (await db.execute(select(Facture).where(Facture.id == facture_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    ancien_statut = f.statut
    f.statut = StatutFacture(data.statut.value)
    await _notifier_client(db, f, ancien_statut, f.statut)
    await db.commit()
    await db.refresh(f)
    client_nom, projet_nom = await _noms(db, f)
    return _to_response(f, client_nom, projet_nom)


# ------------------------------------------------------------
# SUPPRESSION
# ------------------------------------------------------------

@router.delete("/{facture_id:int}", status_code=status.HTTP_204_NO_CONTENT)
async def supprimer_facture(
    facture_id: int,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(_admin_seulement),
):
    f = (await db.execute(select(Facture).where(Facture.id == facture_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    await db.delete(f)
    await db.commit()
    return None
