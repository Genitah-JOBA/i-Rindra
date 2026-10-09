# app/services/facture_pdf.py
"""
PDF d'une facture, aux couleurs de la charte i-Rindra :
  - bandeau bleu nuit pleine largeur portant le logo (version couleur, prévue par
    la charte pour le fond bleu nuit), le titre « FACTURE » et le numéro ;
  - liseré dégradé bleu ciel → vert → turquoise ;
  - cartes et blocs menthe, en-tête de tableau bleu nuit, Total TTC en dégradé ;
  - filet bleu ciel en pied de page.

Les montants sont imprimés dans la devise du CLIENT (« Ar » par défaut), sans
aucune conversion. Polices Helvetica intégrées à ReportLab (accents français).
"""
import io
from decimal import Decimal
from typing import Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.facture import Facture, StatutFacture
from app.services.devis_pdf import (
    CIEL, GRIS, GRIS_CLAIR, LOGO, MENTHE, NUIT, TURQ, VERT, _Degrade, _date, _espace, _p, _styles, montant,
)

# Libellé et couleur de chaque statut
STATUTS = {
    StatutFacture.BROUILLON: ("Brouillon", colors.HexColor("#64748B")),
    StatutFacture.ENVOYEE: ("Envoyée", CIEL),
    StatutFacture.PAYEE: ("Payée", colors.HexColor("#16A34A")),
    StatutFacture.EN_RETARD: ("En retard", colors.HexColor("#DC2626")),
    StatutFacture.ANNULEE: ("Annulée", colors.HexColor("#94A3B8")),
}

MARGE = 15 * mm
BANDEAU = 40 * mm
LARGEUR = A4[0] - 2 * MARGE


def _statut(f: Facture) -> StatutFacture:
    s = f.statut
    return s if isinstance(s, StatutFacture) else StatutFacture(str(s))


def _decor(numero: str):
    """Bandeau bleu nuit, liseré dégradé et pied de page, dessinés sur chaque page."""
    L, H = A4

    def dessiner(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(NUIT)
        canvas.rect(0, H - BANDEAU, L, BANDEAU, stroke=0, fill=1)
        # Liseré dégradé sous le bandeau
        p = canvas.beginPath()
        p.rect(0, H - BANDEAU - 1.8 * mm, L, 1.8 * mm)
        canvas.clipPath(p, stroke=0, fill=0)
        canvas.linearGradient(0, 0, L, 0, (CIEL, VERT, TURQ), (0, 0.55, 1), extend=True)
        canvas.restoreState()

        canvas.saveState()
        if LOGO.exists():
            h_logo = 15 * mm
            canvas.drawImage(str(LOGO), MARGE, H - 9 * mm - h_logo, width=h_logo * 1684 / 682, height=h_logo,
                             mask="auto")
        else:
            canvas.setFillColor(colors.white)
            canvas.setFont("Helvetica-Bold", 20)
            canvas.drawString(MARGE, H - 21 * mm, "i-Rindra")
        canvas.setFillColor(TURQ)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(MARGE, H - 32 * mm, "Bienfe Agency · Antananarivo, Madagascar")

        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 24)
        canvas.drawRightString(L - MARGE, H - 20 * mm, " ".join("FACTURE"))
        canvas.setFillColor(TURQ)
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawRightString(L - MARGE, H - 28 * mm, f"N° {numero}")

        canvas.setStrokeColor(CIEL)
        canvas.setLineWidth(0.6)
        canvas.line(MARGE, 14 * mm, L - MARGE, 14 * mm)
        canvas.setFillColor(GRIS)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(MARGE, 9.5 * mm, "i-Rindra — Gestion de projets assistée par l'IA · Bienfe Agency")
        canvas.drawRightString(L - MARGE, 9.5 * mm, f"Facture {numero} · Page {doc.page}")
        canvas.restoreState()

    return dessiner


def _carte(S, titre, contenu, couleur, largeur):
    t = Table([[[Paragraph(_espace(titre), S["etiq"]), Spacer(1, 1.5 * mm), contenu]]], colWidths=[largeur])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MENTHE),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, couleur),
                           ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm), ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm)]))
    return t


def generer_pdf_facture(f: Facture, client_nom: Optional[str] = None, projet_nom: Optional[str] = None, *,
                        devise: str = "Ar", client_contact: Optional[str] = None,
                        client_email: Optional[str] = None, client_telephone: Optional[str] = None) -> bytes:
    S = _styles()
    devise = (devise or "Ar").strip() or "Ar"
    statut = _statut(f)
    lib, couleur_statut = STATUTS.get(statut, STATUTS[StatutFacture.BROUILLON])
    ht = Decimal(str(f.montant_ht or 0))
    taux = Decimal(str(f.taux_tva or 0))
    tva = Decimal(str(f.montant_tva or 0))
    ttc = Decimal(str(f.montant_ttc or 0))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGE, rightMargin=MARGE,
                            topMargin=BANDEAU + 9 * mm, bottomMargin=20 * mm,
                            title=f"Facture {f.numero}", author="Bienfe Agency — i-Rindra")
    story = []

    # ---- 3 cartes : émission / échéance / statut
    w = (LARGEUR - 8 * mm) / 3
    statut_p = Paragraph(escape(lib), ParagraphStyle("st", fontName="Helvetica-Bold", fontSize=11, leading=14,
                                                     textColor=couleur_statut))
    cartes = Table([[_carte(S, "ÉMISE LE", _p(_date(f.date_emission), S["fort"]), CIEL, w), "",
                     _carte(S, "ÉCHÉANCE", _p(_date(f.date_echeance), S["fort"]), TURQ, w), "",
                     _carte(S, "STATUT", statut_p, couleur_statut, w)]],
                   colWidths=[w, 4 * mm, w, 4 * mm, w])
    cartes.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story += [cartes, Spacer(1, 6 * mm)]

    # ---- blocs « Facturé à » / « Projet »
    adresse = [Paragraph(_espace("FACTURÉ À"), S["etiq"]), Spacer(1, 2 * mm),
               _p(client_nom or "Client non renseigné", S["fort"])]
    for info in (client_contact, client_email, client_telephone):
        if info:
            adresse.append(_p(info, S["normal"]))
    projet = [Paragraph(_espace("PROJET"), S["etiq"]), Spacer(1, 2 * mm),
              _p(projet_nom or "Prestations de l'agence", S["fort"])]
    blocs = Table([[adresse, "", projet]], colWidths=[LARGEUR / 2 - 2.5 * mm, 5 * mm, LARGEUR / 2 - 2.5 * mm])
    blocs.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.6, GRIS_CLAIR), ("BOX", (2, 0), (2, 0), 0.6, GRIS_CLAIR),
                               ("LINEABOVE", (0, 0), (0, 0), 2, NUIT), ("LINEABOVE", (2, 0), (2, 0), 2, NUIT),
                               ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("LEFTPADDING", (0, 0), (0, 0), 5 * mm), ("LEFTPADDING", (2, 0), (2, 0), 5 * mm),
                               ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm)]))
    story += [blocs, Spacer(1, 7 * mm)]

    # ---- ligne facturée
    taux_txt = f"{taux.normalize():f} %".replace(".", ",") if taux else "—"
    designation = [_p(f"Prestations — {projet_nom}" if projet_nom else "Prestations de l'agence", S["gras"])]
    if f.notes:
        designation.append(_p(f.notes, S["petit"]))
    tab = Table([[Paragraph("DÉSIGNATION", S["entete"]), Paragraph("TVA", S["entete_d"]),
                  Paragraph("MONTANT&nbsp;HT", S["entete_d"])],
                 [designation, _p(taux_txt, S["droite"]), _p(montant(ht, devise), S["droite_g"])]],
                colWidths=[LARGEUR - 26 * mm - 42 * mm, 26 * mm, 42 * mm])
    tab.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NUIT), ("BACKGROUND", (0, 1), (-1, -1), MENTHE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 3 * mm), ("BOTTOMPADDING", (0, 0), (-1, 0), 3 * mm),
        ("TOPPADDING", (0, 1), (-1, -1), 3.5 * mm), ("BOTTOMPADDING", (0, 1), (-1, -1), 3.5 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("LINEBELOW", (0, -1), (-1, -1), 1.2, CIEL),
    ]))
    story += [tab, Spacer(1, 6 * mm)]

    # ---- totaux
    if statut == StatutFacture.PAYEE:
        etat = "Facture réglée. Merci pour votre confiance."
    elif statut == StatutFacture.ANNULEE:
        etat = "Facture annulée : aucun paiement n'est dû."
    elif f.date_echeance:
        etat = f"À régler au plus tard le {_date(f.date_echeance)}."
    else:
        etat = "À régler à réception."
    gauche_tot = [_p(etat, S["gras"]), Spacer(1, 2 * mm), _p(f"Montants exprimés en {devise}.", S["normal"])]
    totaux = Table([[_p("Total HT", S["normal"]), _p(montant(ht, devise), S["droite_g"])],
                    [_p(f"TVA ({taux_txt})" if taux else "TVA", S["normal"]), _p(montant(tva, devise), S["droite_g"])]],
                   colWidths=[38 * mm, 42 * mm])
    totaux.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 2 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
                                ("LINEBELOW", (0, 0), (-1, 0), 0.5, GRIS_CLAIR)]))
    bloc_tot = [totaux, Spacer(1, 2 * mm), _Degrade(80 * mm, 12 * mm, gauche="Total TTC", droite=montant(ttc, devise))]
    recap = Table([[gauche_tot, bloc_tot]], colWidths=[LARGEUR - 82 * mm, 82 * mm])
    recap.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story += [KeepTogether(recap), Spacer(1, 9 * mm)]

    # ---- encadré de règlement
    paiement = Table([[[Paragraph(_espace("RÈGLEMENT"), S["etiq"]), Spacer(1, 1.5 * mm),
                        _p(f"Merci d'indiquer le numéro de facture {f.numero} lors de votre paiement. "
                           "Pour toute question, contactez Bienfe Agency.", S["petit"])]]],
                     colWidths=[LARGEUR])
    paiement.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MENTHE),
                                  ("LINEBEFORE", (0, 0), (0, -1), 3, VERT),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm), ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm)]))
    story.append(KeepTogether(paiement))

    decor = _decor(f.numero)
    doc.build(story, onFirstPage=decor, onLaterPages=decor)
    return buf.getvalue()
