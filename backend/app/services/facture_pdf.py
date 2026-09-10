# app/services/facture_pdf.py
"""
Génération d'un PDF de facture côté serveur.
Implémentation minimale (PDF 1.4) : aucun dépendance externe, encodage
WinAnsi (Latin-1) compatible avec les accents français.
"""
from datetime import date
from typing import List, Optional

from app.models.facture import Facture, StatutFacture


_STATUT_LIBELLE = {
    StatutFacture.BROUILLON: "Brouillon",
    StatutFacture.ENVOYEE: "Envoyée",
    StatutFacture.PAYEE: "Payée",
    StatutFacture.EN_RETARD: "En retard",
    StatutFacture.ANNULEE: "Annulée",
}

# Couleurs RVB (0-255) associées à chaque statut
_COULEURS = {
    StatutFacture.BROUILLON: (120, 120, 120),
    StatutFacture.ENVOYEE: (0, 178, 160),
    StatutFacture.PAYEE: (99, 178, 62),
    StatutFacture.EN_RETARD: (220, 160, 0),
    StatutFacture.ANNULEE: (210, 60, 60),
}


def _esc(s) -> str:
    """Échappe les caractères réservés d'une chaîne PDF."""
    return (
        str(s)
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def _montant(v) -> str:
    """Formate un montant : '1234.50' -> '1234,50'."""
    return f"{v:.2f}".replace(".", ",")


def _date(d) -> str:
    if not d:
        return "-"
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def _wraplines(s: str, largeur: int) -> List[str]:
    """Découpe un texte en lignes d'au plus `largeur` caractères."""
    lignes, courante = [], ""
    for mot in str(s).split():
        if len(courante) + len(mot) + 1 > largeur:
            lignes.append(courante)
            courante = mot
        else:
            courante = (courante + " " + mot).strip()
    if courante:
        lignes.append(courante)
    return lignes


def generer_pdf_facture(f: Facture, client_nom=None, projet_nom=None) -> bytes:
    """Construit le PDF d'une facture (page A4)."""
    statut = f.statut if hasattr(f.statut, "value") else StatutFacture(f.statut)
    blanc = 1, 1, 1
    noir = 0, 0, 0
    gris = 0.45, 0.45, 0.45
    r, g, b = tuple(v / 255 for v in _COULEURS[statut])

    cmd = []

    def texte(x, y, taille, fonte, txt, col=noir):
        cmd.append(
            f"BT /{fonte} {taille} Tf {col[0]} {col[1]} {col[2]} rg "
            f"{x} {y} Td ({_esc(txt)}) Tj ET"
        )

    def barre(x1, y1, x2, y2, ep=1, c=0.85):
        cmd.append(f"{c} {c} {c} RG {ep} w {x1} {y1} m {x2} {y2} l S")

    def bloc(x, y, w, h, cr, cg, cb):
        cmd.append(f"{cr} {cg} {cb} rg {x} {y} {w} {h} re f")

    # ----- En-tête -----
    texte(40, 795, 26, "F2", "FACTURE")
    texte(40, 762, 12, "F1", f"N° {f.numero}", gris)

    # Badge statut
    bloc(468, 783, 90, 26, r, g, b)
    texte(478, 797, 11, "F2", _STATUT_LIBELLE[statut], blanc)
    barre(40, 748, 555, 748)

    # ----- Coordonnées -----
    texte(40, 720, 10, "F1", "Date d'émission :", gris)
    texte(140, 720, 11, "F2", _date(f.date_emission))
    texte(40, 700, 10, "F1", "Date d'échéance :", gris)
    texte(140, 700, 11, "F2", _date(f.date_echeance))
    texte(40, 680, 10, "F1", "Client :", gris)
    texte(140, 680, 11, "F2", client_nom or f"Client n°{f.client_id}")
    texte(40, 660, 10, "F1", "Projet :", gris)
    texte(140, 660, 11, "F2", projet_nom or "-")
    barre(40, 640, 555, 640)

    # ----- Table des montants -----
    texte(40, 618, 11, "F2", "Désignation")
    texte(420, 618, 11, "F2", "Montant HT")
    barre(40, 606, 555, 606)
    texte(40, 584, 11, "F1", f"Prestations au titre de la facture {f.numero}")
    texte(420, 584, 11, "F1", f"{_montant(f.montant_ht)} EUR")
    barre(40, 566, 555, 566)

    # ----- Totaux -----
    texte(395, 540, 11, "F1", "Total HT", gris)
    texte(470, 540, 11, "F1", f"{_montant(f.montant_ht)} EUR")
    texte(395, 522, 11, "F1", f"TVA ({_montant(f.taux_tva)} %)", gris)
    texte(470, 522, 11, "F1", f"{_montant(f.montant_tva)} EUR")
    texte(395, 496, 12, "F2", "Total TTC")
    texte(470, 496, 12, "F2", f"{_montant(f.montant_ttc)} EUR")

    # ----- Notes -----
    if f.notes:
        y = 470
        texte(40, y, 10, "F2", "Notes :", gris)
        for ligne in _wraplines(f.notes, 100):
            y -= 16
            texte(40, y, 10, "F3", ligne)

    stream = ("\n".join(cmd) + "\n").encode("latin-1", "replace")
    return _assembler(stream)


def _assembler(stream: bytes) -> bytes:
    """Assemble les objets PDF avec une table xref correcte."""
    objets = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> "
            b"/Contents 7 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objets, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i
        out += o
        out += b"\nendobj\n"

    xref = len(out)
    out += b"xref\n0 %d\n" % (len(objets) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += (
        b"trailer\n"
        b"<< /Size %d /Root 1 0 R >>\n"
        b"startxref\n%d\n%%%%EOF\n" % (len(objets) + 1, xref)
    )
    return bytes(out)