# app/services/facture_pdf.py
"""
PDF d'une facture, au même gabarit que les devis (devis_pdf.py) : charte i-Rindra
(bleu nuit, dégradé bleu ciel → vert → turquoise), logo, blocs « Facturé à » /
« Projet », récapitulatif HT / TVA / TTC.

Les montants sont imprimés dans la devise du CLIENT (« Ar » par défaut), sans
aucune conversion. Polices Helvetica intégrées à ReportLab (accents français).
"""
import io
from decimal import Decimal
from typing import Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.facture import Facture, StatutFacture
from app.services.devis_pdf import (
    CIEL, GRIS, GRIS_CLAIR, LOGO, MENTHE, NUIT, _Degrade, _date, _espace, _p, _styles, montant,
)

# Libellé, fond et encre du badge de statut
STATUTS = {
    StatutFacture.BROUILLON: ("Brouillon", colors.HexColor("#F1F5F9"), colors.HexColor("#475569")),
    StatutFacture.ENVOYEE: ("Envoyée", colors.HexColor("#DBEAFE"), colors.HexColor("#1E40AF")),
    StatutFacture.PAYEE: ("Payée", colors.HexColor("#DCFCE7"), NUIT),
    StatutFacture.EN_RETARD: ("En retard", colors.HexColor("#FEE2E2"), colors.HexColor("#991B1B")),
    StatutFacture.ANNULEE: ("Annulée", colors.HexColor("#F1F5F9"), colors.HexColor("#94A3B8")),
}


def _statut(f: Facture) -> StatutFacture:
    s = f.statut
    return s if isinstance(s, StatutFacture) else StatutFacture(str(s))


def generer_pdf_facture(f: Facture, client_nom: Optional[str] = None, projet_nom: Optional[str] = None, *,
                        devise: str = "Ar", client_contact: Optional[str] = None,
                        client_email: Optional[str] = None, client_telephone: Optional[str] = None) -> bytes:
    S = _styles()
    devise = (devise or "Ar").strip() or "Ar"
    statut = _statut(f)
    ht = Decimal(str(f.montant_ht or 0))
    taux = Decimal(str(f.taux_tva or 0))
    tva = Decimal(str(f.montant_tva or 0))
    ttc = Decimal(str(f.montant_ttc or 0))

    buf = io.BytesIO()
    largeur = A4[0] - 30 * mm

    def pied(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(GRIS)
        canvas.drawString(15 * mm, 10 * mm, f"Bienfe Agency · Facture {f.numero} · i-Rindra")
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=18 * mm,
                            title=f"Facture {f.numero}", author="Bienfe Agency — i-Rindra")
    story = []

    # ---- en-tête : logo + agence | FACTURE + numéro + dates + statut
    logo = (Image(str(LOGO), width=40 * mm, height=40 * mm * 682 / 1684) if LOGO.exists()
            else _p("i-Rindra", S["fort"]))
    gauche = [logo, Spacer(1, 3 * mm), _p("Bienfe Agency", S["gras"]), _p("Antananarivo, Madagascar", S["petit"])]

    lib, fond, encre = STATUTS.get(statut, STATUTS[StatutFacture.BROUILLON])
    badge = Table([[Paragraph(escape(lib), ParagraphStyle("b", fontName="Helvetica-Bold", fontSize=8,
                                                         textColor=encre, alignment=1))]],
                  colWidths=[24 * mm], rowHeights=[6 * mm])
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), fond), ("ROUNDEDCORNERS", [3, 3, 3, 3]),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    dates = Table([[_p("Date d'émission", S["droite"]), _p(_date(f.date_emission), S["droite_g"])],
                   [_p("Échéance", S["droite"]), _p(_date(f.date_echeance), S["droite_g"])]],
                  colWidths=[32 * mm, 22 * mm])
    dates.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    droite = [Paragraph(_espace("FACTURE"), ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=24, leading=28,
                                                           textColor=NUIT, alignment=TA_RIGHT)),
              Paragraph(f"N° {escape(f.numero)}", ParagraphStyle("n", fontName="Helvetica-Bold", fontSize=12,
                                                                  leading=16, textColor=CIEL, alignment=TA_RIGHT)),
              Spacer(1, 2 * mm), dates, Spacer(1, 2 * mm), badge]
    tete = Table([[gauche, droite]], colWidths=[largeur * 0.55, largeur * 0.45])
    tete.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [tete, Spacer(1, 4 * mm), _Degrade(largeur, 1.4 * mm), Spacer(1, 5 * mm)]

    # ---- blocs « Facturé à » / « Projet »
    adresse = [Paragraph(_espace("FACTURÉ À"), S["etiq"]), Spacer(1, 2 * mm),
               _p(client_nom or "Client non renseigné", S["fort"])]
    for info in (client_contact, client_email, client_telephone):
        if info:
            adresse.append(_p(info, S["normal"]))
    projet = [Paragraph(_espace("PROJET"), S["etiq"]), Spacer(1, 2 * mm),
              _p(projet_nom or "Prestations de l'agence", S["fort"])]
    blocs = Table([[adresse, "", projet]], colWidths=[largeur / 2 - 2.5 * mm, 5 * mm, largeur / 2 - 2.5 * mm])
    blocs.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.6, GRIS_CLAIR), ("BOX", (2, 0), (2, 0), 0.6, GRIS_CLAIR),
                               ("ROUNDEDCORNERS", [4, 4, 4, 4]), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("LEFTPADDING", (0, 0), (0, 0), 5 * mm), ("LEFTPADDING", (2, 0), (2, 0), 5 * mm),
                               ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm)]))
    story += [blocs, Spacer(1, 6 * mm)]

    # ---- ligne facturée
    taux_txt = f"{taux.normalize():f} %".replace(".", ",") if taux else "—"
    cols = [largeur - 26 * mm - 42 * mm, 26 * mm, 42 * mm]
    donnees = [[Paragraph("DÉSIGNATION", S["entete"]), Paragraph("TVA", S["entete_d"]),
                Paragraph("MONTANT&nbsp;HT", S["entete_d"])],
               [[_p(f"Prestations — {projet_nom}" if projet_nom else "Prestations de l'agence", S["gras"])]
                + ([_p(f.notes, S["petit"])] if f.notes else []),
                _p(taux_txt, S["droite"]), _p(montant(ht, devise), S["droite_g"])]]
    tab = Table(donnees, colWidths=cols)
    tab.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NUIT), ("ROUNDEDCORNERS", [4, 4, 0, 0]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 3 * mm), ("BOTTOMPADDING", (0, 0), (-1, 0), 3 * mm),
        ("TOPPADDING", (0, 1), (-1, -1), 3 * mm), ("BOTTOMPADDING", (0, 1), (-1, -1), 3 * mm),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, GRIS_CLAIR),
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
    lib_tva = f"TVA ({taux_txt})" if taux else "TVA"
    totaux = Table([[_p("Total HT", S["normal"]), _p(montant(ht, devise), S["droite_g"])],
                    [_p(lib_tva, S["normal"]), _p(montant(tva, devise), S["droite_g"])]],
                   colWidths=[38 * mm, 42 * mm])
    totaux.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 2 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm)]))
    bloc_tot = [totaux, Spacer(1, 2 * mm),
                _Degrade(80 * mm, 12 * mm, rayon=3, gauche="Total TTC", droite=montant(ttc, devise))]
    recap = Table([[gauche_tot, bloc_tot]], colWidths=[largeur - 82 * mm, 82 * mm])
    recap.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story += [KeepTogether(recap), Spacer(1, 8 * mm)]

    # ---- encadré de paiement
    paiement = Table([[[Paragraph(_espace("RÈGLEMENT"), S["etiq"]), Spacer(1, 1.5 * mm),
                        _p("Merci d'indiquer le numéro de facture " + f.numero + " lors de votre paiement.",
                           S["petit"])]]],
                     colWidths=[largeur])
    paiement.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MENTHE), ("BOX", (0, 0), (-1, -1), 0.6, CIEL),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm), ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm)]))
    story.append(KeepTogether(paiement))

    doc.build(story, onFirstPage=pied, onLaterPages=pied)
    return buf.getvalue()
