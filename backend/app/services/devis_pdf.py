# app/services/devis_pdf.py
"""
PDF d'un devis (SuggestionDevis), même gabarit que les devis B-esti, aux couleurs
de la charte i-Rindra (bleu nuit, dégradé bleu ciel → vert → turquoise).

Le devis est rédigé par l'IA en texte libre (Markdown). On en extrait :
  - le tableau des prestations (quantité, désignation, prix unitaire, total HT) ;
  - le taux de TVA mentionné (« TVA (20 %) »), sinon 0 ;
  - la section « Conditions de paiement et délais ».
Le client, le projet, la devise, la date et le statut viennent de la base, jamais
du texte de l'IA. Si aucun tableau n'est exploitable, le texte est repris tel quel.

Polices Helvetica intégrées à ReportLab (WinAnsi) : accents français, « », — et ·
sont pris en charge sans fichier de police à déployer.
"""
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Flowable, Image, KeepTogether, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

# ---------------------------------------------------------------- charte i-Rindra
NUIT = colors.HexColor("#0B2241")
CIEL = colors.HexColor("#4FB0F1")
VERT = colors.HexColor("#7DF979")
TURQ = colors.HexColor("#7AFDF2")
MENTHE = colors.HexColor("#EEFBF6")
GRIS = colors.HexColor("#5B6676")
GRIS_CLAIR = colors.HexColor("#D9E2EC")
TEXTE = colors.HexColor("#1B2533")

LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo-i-rindra.png"
VALIDITE_JOURS = 30

STATUTS = {
    "en_attente": ("En attente", colors.HexColor("#FEF3C7"), colors.HexColor("#92400E")),
    "validee": ("Validé", colors.HexColor("#DCFCE7"), NUIT),
    "refusee": ("Refusé", colors.HexColor("#FEE2E2"), colors.HexColor("#991B1B")),
}


# ================================================================ extraction du texte IA
@dataclass
class LigneDevis:
    designation: str
    details: List[str] = field(default_factory=list)
    quantite: Decimal = Decimal(1)
    unite: str = ""
    prix_unitaire: Decimal = Decimal(0)

    @property
    def total(self) -> Decimal:
        return self.quantite * self.prix_unitaire


def _sans_markdown(texte: str) -> str:
    t = re.sub(r"\*\*|__|`", "", texte or "")
    t = re.sub(r"(?<!\w)\*(?!\s)|(?<!\s)\*(?!\w)", "", t)
    return t.strip()


def _nombre(texte: str) -> Optional[Decimal]:
    """« 1,200,000 Ar », « 1 200 000 », « 10,13 j », « 3 000,50 » → Decimal."""
    t = _sans_markdown(texte).replace(" ", " ").replace(" ", " ")
    m = re.search(r"\d[\d\s.,]*", t)
    if not m:
        return None
    n = m.group(0).strip().replace(" ", "")
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", n):        # 1,200,000(.50)
        n = n.replace(",", "")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", n):     # 1.200.000(,50)
        n = n.replace(".", "").replace(",", ".")
    else:                                                    # 10,13 ou 1200000
        n = n.replace(",", ".")
    try:
        return Decimal(n.rstrip("."))
    except InvalidOperation:
        return None


def _unite(texte: str) -> str:
    m = re.search(r"\d[\d\s.,]*\s*([a-zA-Zéèû]+)\.?\s*$", _sans_markdown(texte))
    u = m.group(1) if m else ""
    return "" if u.lower() in ("ar", "mga", "eur", "usd") else u


def _cellules(ligne: str) -> List[str]:
    return [c.strip() for c in ligne.strip().strip("|").split("|")]


def extraire_lignes(contenu: str) -> List[LigneDevis]:
    """Lignes du premier tableau Markdown qui contient une colonne « Désignation »."""
    lignes = (contenu or "").splitlines()
    for i, brut in enumerate(lignes):
        if not brut.strip().startswith("|"):
            continue
        entete = [_sans_markdown(c).lower() for c in _cellules(brut)]
        if not any("signation" in c for c in entete):
            continue
        idx = {}
        for j, c in enumerate(entete):
            if "signation" in c:
                idx.setdefault("des", j)
            elif c.startswith("qt") or "quantit" in c:
                idx.setdefault("qte", j)
            elif "prix" in c or "unitaire" in c:
                idx.setdefault("pu", j)
            elif "total" in c or "montant" in c:
                idx.setdefault("tot", j)
        resultat = []
        for brut2 in lignes[i + 1:]:
            if not brut2.strip().startswith("|"):
                break
            cells = _cellules(brut2)
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                continue  # ligne de séparation
            get = lambda k: cells[idx[k]] if k in idx and idx[k] < len(cells) else ""
            des = get("des")
            nom = _sans_markdown(re.split(r"<br\s*/?>", des)[0])
            if not nom or re.search(r"\btotal\b|\btva\b", nom, re.I):
                continue
            details = [_sans_markdown(d).lstrip("-• ").strip() for d in re.split(r"<br\s*/?>", des)[1:]]
            qte = _nombre(get("qte")) or Decimal(1)
            pu = _nombre(get("pu"))
            tot = _nombre(get("tot"))
            if pu is None and tot is not None:
                pu = tot / qte if qte else tot
            resultat.append(LigneDevis(nom, [d for d in details if d], qte, _unite(get("qte")), pu or Decimal(0)))
        if resultat:
            return resultat
    return []


def extraire_taux_tva(contenu: str) -> Decimal:
    m = re.search(r"TVA[^0-9\n]{0,15}(\d{1,2}(?:[.,]\d+)?)\s*%", contenu or "", re.I)
    return Decimal(m.group(1).replace(",", ".")) if m else Decimal(0)


def extraire_devise(contenu: str, par_defaut: str = "Ar") -> str:
    """
    Devise dans laquelle l'IA a écrit les montants (« 150 000 Ar », « 1 200 € »…).

    Aucun montant n'est converti : un devis rédigé en ariary reste en ariary, même
    pour un client international. La devise du client ne sert que si le texte
    n'en mentionne aucune.
    """
    t = contenu or ""
    comptes = {
        "Ar": len(re.findall(r"\bAr\b|\bariary\b|\bMGA\b", t, re.I)),
        "EUR": len(re.findall(r"\bEUR\b|€|\beuros?\b", t, re.I)),
        "USD": len(re.findall(r"\bUSD\b|\$|\bdollars?\b", t, re.I)),
    }
    devise, n = max(comptes.items(), key=lambda kv: kv[1])
    return devise if n else (par_defaut or "Ar")


def extraire_conditions(contenu: str) -> List[str]:
    """Lignes de la section « Conditions… » (paiement, délais), sans Markdown."""
    lignes = (contenu or "").splitlines()
    for i, l in enumerate(lignes):
        if re.search(r"conditions", _sans_markdown(l), re.I) and len(_sans_markdown(l)) < 80:
            bloc = []
            for suite in lignes[i + 1:]:
                if suite.strip().startswith("#") or suite.strip() == "---":
                    if bloc:
                        break
                    continue
                s = _sans_markdown(suite).lstrip("-• ").strip()
                if s:
                    bloc.append(s)
                if len(bloc) >= 8:
                    break
            return bloc
    return []


# ================================================================ mise en forme
def montant(v: Decimal, devise: str) -> str:
    v = Decimal(v).quantize(Decimal("0.01"))
    entier, dec = f"{v:.2f}".split(".")
    signe = "-" if entier.startswith("-") else ""
    entier = entier.lstrip("-")
    groupes = []
    while entier:
        groupes.insert(0, entier[-3:])
        entier = entier[:-3]
    texte = signe + " ".join(groupes)
    if dec != "00":
        texte += "," + dec
    return f"{texte} {devise}"


def quantite(q: Decimal, unite: str) -> str:
    t = f"{q.normalize():f}".replace(".", ",")
    return f"{t} {unite}".strip()


def numero_devis(devis_id: int, cree_le: Optional[datetime]) -> str:
    annee = (cree_le or datetime.now()).year % 100
    return f"D{devis_id:02d}/{annee:02d}"


def _date(d) -> str:
    return d.strftime("%d/%m/%Y") if d else "—"


class _Degrade(Flowable):
    """Bande ou cartouche en dégradé bleu ciel → vert → turquoise (charte)."""

    def __init__(self, largeur, hauteur, rayon=0, gauche="", droite=""):
        super().__init__()
        self.width, self.height, self.rayon = largeur, hauteur, rayon
        self.gauche, self.droite = gauche, droite

    def draw(self):
        c = self.canv
        c.saveState()
        p = c.beginPath()
        if self.rayon:
            p.roundRect(0, 0, self.width, self.height, self.rayon)
        else:
            p.rect(0, 0, self.width, self.height)
        c.clipPath(p, stroke=0, fill=0)
        c.linearGradient(0, 0, self.width, 0, (CIEL, VERT, TURQ), (0, 0.6, 1), extend=True)
        c.restoreState()
        if self.gauche or self.droite:
            c.setFillColor(NUIT)
            c.setFont("Helvetica-Bold", 15)
            c.drawString(5 * mm, self.height / 2 - 5, self.gauche)
            c.drawRightString(self.width - 5 * mm, self.height / 2 - 5, self.droite)


def _styles():
    return {
        "petit": ParagraphStyle("petit", fontName="Helvetica", fontSize=8.5, leading=11, textColor=GRIS),
        "normal": ParagraphStyle("normal", fontName="Helvetica", fontSize=9.5, leading=13, textColor=TEXTE),
        "gras": ParagraphStyle("gras", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=NUIT),
        "etiq": ParagraphStyle("etiq", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=CIEL),
        "fort": ParagraphStyle("fort", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=NUIT),
        "droite": ParagraphStyle("droite", fontName="Helvetica", fontSize=9.5, leading=13, textColor=TEXTE, alignment=TA_RIGHT),
        "droite_g": ParagraphStyle("droite_g", fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=NUIT, alignment=TA_RIGHT),
        "entete": ParagraphStyle("entete", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white),
        "entete_d": ParagraphStyle("entete_d", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white, alignment=TA_RIGHT),
    }


def _p(texte, style):
    return Paragraph(escape(str(texte or "")).replace("\n", "<br/>"), style)


def _espace(texte: str) -> str:
    """Lettres espacées, comme les étiquettes du gabarit (« A D R E S S É  À »)."""
    return "&nbsp;".join(escape(texte))


def apercu_devis(*, devis_id: int, contenu: str, cree_le: Optional[datetime], devise: str = "Ar") -> dict:
    """
    Données du devis telles qu'imprimées sur le PDF, déjà formatées.

    Sert à l'affichage « Voir le détail » : le PDF et l'écran utilisent les mêmes
    fonctions d'extraction et de mise en forme, donc les mêmes chiffres.
    """
    devise = extraire_devise(contenu, (devise or "Ar").strip() or "Ar")
    emis = (cree_le or datetime.now()).date() if isinstance(cree_le, datetime) else (cree_le or date.today())
    valable = emis + timedelta(days=VALIDITE_JOURS)
    lignes = extraire_lignes(contenu)
    taux = extraire_taux_tva(contenu)
    total_ht = sum((l.total for l in lignes), Decimal(0))
    tva = (total_ht * taux / 100).quantize(Decimal("0.01"))
    nb_jours = sum((l.quantite for l in lignes if l.unite.lower().startswith("j")), Decimal(0))
    return {
        "numero": numero_devis(devis_id, cree_le),
        "date_emission": _date(emis),
        "valable_jusqu_au": _date(valable),
        "devise": devise,
        "lignes": [
            {
                "designation": l.designation,
                "details": l.details[:6],
                "quantite": quantite(l.quantite, l.unite),
                "prix_unitaire": montant(l.prix_unitaire, devise),
                "taxe": f"{taux.normalize():f} %".replace(".", ",") if taux else "—",
                "total": montant(l.total, devise),
            }
            for l in lignes
        ],
        "nb_jours": quantite(nb_jours, "") if nb_jours else None,
        "libelle_taxe": f"TVA ({taux.normalize():f} %)".replace(".", ",") if taux else "Taxes",
        "total_ht": montant(total_ht, devise),
        "taxes": montant(tva, devise),
        "total_ttc": montant(total_ht + tva, devise),
        "conditions": extraire_conditions(contenu),
    }


def generer_pdf_devis(*, devis_id: int, titre: Optional[str], contenu: str, statut: str,
                      cree_le: Optional[datetime], modele: Optional[str],
                      client_nom: Optional[str], client_contact: Optional[str] = None,
                      client_email: Optional[str] = None, client_telephone: Optional[str] = None,
                      devise: str = "Ar", projet_nom: Optional[str] = None) -> bytes:
    S = _styles()
    # Les montants restent dans la devise où ils ont été rédigés (aucune conversion).
    devise = extraire_devise(contenu, (devise or "Ar").strip() or "Ar")
    numero = numero_devis(devis_id, cree_le)
    emis = (cree_le or datetime.now()).date() if isinstance(cree_le, datetime) else (cree_le or date.today())
    valable = emis + timedelta(days=VALIDITE_JOURS)

    lignes = extraire_lignes(contenu)
    taux = extraire_taux_tva(contenu)
    conditions = extraire_conditions(contenu)
    total_ht = sum((l.total for l in lignes), Decimal(0))
    tva = (total_ht * taux / 100).quantize(Decimal("0.01"))
    ttc = total_ht + tva

    buf = io.BytesIO()
    largeur = A4[0] - 30 * mm

    def pied(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(GRIS)
        canvas.drawString(15 * mm, 10 * mm, f"Bienfe Agency · Devis {numero} · i-Rindra")
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=18 * mm,
                            title=f"Devis {numero}", author="Bienfe Agency — i-Rindra")
    story = []

    # ---- en-tête : logo + agence | DEVIS + numéro + dates + statut
    logo = Image(str(LOGO), width=40 * mm, height=40 * mm * 682 / 1684) if LOGO.exists() else _p("i-Rindra", S["fort"])
    gauche = [logo, Spacer(1, 3 * mm), _p("Bienfe Agency", S["gras"]), _p("Antananarivo, Madagascar", S["petit"])]
    lib, fond, encre = STATUTS.get(statut, STATUTS["en_attente"])
    badge = Table([[Paragraph(escape(lib), ParagraphStyle("b", fontName="Helvetica-Bold", fontSize=8,
                                                         textColor=encre, alignment=1))]],
                  colWidths=[24 * mm], rowHeights=[6 * mm])
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), fond), ("ROUNDEDCORNERS", [3, 3, 3, 3]),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    dates = Table([[_p("Date d'émission", S["droite"]), _p(_date(emis), S["droite_g"])],
                   [_p("Valable jusqu'au", S["droite"]), _p(_date(valable), S["droite_g"])]],
                  colWidths=[32 * mm, 22 * mm])
    dates.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    droite = [Paragraph(_espace("DEVIS"), ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=24, leading=28,
                                                         textColor=NUIT, alignment=TA_RIGHT)),
              Paragraph(f"N° {escape(numero)}", ParagraphStyle("n", fontName="Helvetica-Bold", fontSize=12,
                                                                leading=16, textColor=CIEL, alignment=TA_RIGHT)),
              Spacer(1, 2 * mm), dates, Spacer(1, 2 * mm), badge]
    tete = Table([[gauche, droite]], colWidths=[largeur * 0.55, largeur * 0.45])
    tete.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [tete, Spacer(1, 4 * mm), _Degrade(largeur, 1.4 * mm), Spacer(1, 5 * mm)]

    # ---- blocs « Adressé à » / « Projet »
    adresse = [Paragraph(_espace("ADRESSÉ À"), S["etiq"]), Spacer(1, 2 * mm),
               _p(client_nom or "Client non renseigné", S["fort"])]
    for info in (client_contact, client_email, client_telephone):
        if info:
            adresse.append(_p(info, S["normal"]))
    projet = [Paragraph(_espace("PROJET"), S["etiq"]), Spacer(1, 2 * mm),
              _p(projet_nom or titre or "Projet non renseigné", S["fort"])]
    if titre and projet_nom and titre != projet_nom:
        projet.append(_p(titre, S["normal"]))
    blocs = Table([[adresse, "", projet]], colWidths=[largeur / 2 - 2.5 * mm, 5 * mm, largeur / 2 - 2.5 * mm])
    blocs.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.6, GRIS_CLAIR), ("BOX", (2, 0), (2, 0), 0.6, GRIS_CLAIR),
                               ("ROUNDEDCORNERS", [4, 4, 4, 4]), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("LEFTPADDING", (0, 0), (0, 0), 5 * mm), ("LEFTPADDING", (2, 0), (2, 0), 5 * mm),
                               ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm)]))
    story += [blocs, Spacer(1, 6 * mm)]

    # ---- tableau des prestations
    if lignes:
        cols = [10 * mm, largeur - 10 * mm - 20 * mm - 36 * mm - 16 * mm - 32 * mm, 20 * mm, 36 * mm, 16 * mm, 32 * mm]
        donnees = [[Paragraph("#", S["entete"]), Paragraph("DÉSIGNATION", S["entete"]),
                    Paragraph("QTÉ", S["entete_d"]), Paragraph("PRIX&nbsp;UNITAIRE", S["entete_d"]),
                    Paragraph("TAXE", S["entete_d"]), Paragraph("TOTAL&nbsp;HT", S["entete_d"])]]
        for i, l in enumerate(lignes, 1):
            des = [_p(l.designation, S["gras"])] + [_p(f"– {d}", S["petit"]) for d in l.details[:6]]
            donnees.append([_p(f"{i:02d}", S["petit"]), des, _p(quantite(l.quantite, l.unite), S["droite"]),
                            _p(montant(l.prix_unitaire, devise), S["droite"]),
                            _p(f"{taux.normalize():f} %".replace(".", ",") if taux else "—", S["droite"]),
                            _p(montant(l.total, devise), S["droite_g"])])
        tab = Table(donnees, colWidths=cols, repeatRows=1)
        tab.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NUIT), ("ROUNDEDCORNERS", [4, 4, 0, 0]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, 0), 3 * mm), ("BOTTOMPADDING", (0, 0), (-1, 0), 3 * mm),
            ("TOPPADDING", (0, 1), (-1, -1), 2.2 * mm), ("BOTTOMPADDING", (0, 1), (-1, -1), 2.2 * mm),
            ("LINEBELOW", (0, 1), (-1, -1), 0.5, GRIS_CLAIR),
        ]))
        story += [tab, Spacer(1, 6 * mm)]

        # ---- résumé + totaux
        nb_jours = sum((l.quantite for l in lignes if l.unite.lower().startswith("j")), Decimal(0))
        resume = f"<b>{len(lignes)}</b> ligne{'s' if len(lignes) > 1 else ''}"
        if nb_jours:
            resume += f" · <b>{quantite(nb_jours, '')}</b> j au total"
        gauche_tot = [Paragraph(resume + ".", S["normal"]), Spacer(1, 2 * mm),
                      _p(f"Montants exprimés en {devise}.", S["normal"])]
        lib_tva = f"TVA ({taux.normalize():f} %)".replace(".", ",") if taux else "Taxes"
        totaux = Table([[_p("Total HT", S["normal"]), _p(montant(total_ht, devise), S["droite_g"])],
                        [_p(lib_tva, S["normal"]), _p(montant(tva, devise), S["droite_g"])]],
                       colWidths=[38 * mm, 42 * mm])
        totaux.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 2 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm)]))
        bloc_tot = [totaux, Spacer(1, 2 * mm), _Degrade(80 * mm, 12 * mm, rayon=3, gauche="Total TTC",
                                                         droite=montant(ttc, devise))]
        recap = Table([[gauche_tot, bloc_tot]], colWidths=[largeur - 82 * mm, 82 * mm])
        recap.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                   ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
        story += [KeepTogether(recap), Spacer(1, 6 * mm)]
    else:
        # Aucun tableau exploitable : on reprend le texte de l'IA, nettoyé.
        texte = "\n".join(_sans_markdown(l) for l in (contenu or "").splitlines() if l.strip() and l.strip() != "---")
        story += [Paragraph(_espace("DÉTAIL DU DEVIS"), S["etiq"]), Spacer(1, 2 * mm), _p(texte, S["normal"]),
                  Spacer(1, 8 * mm)]

    # ---- conditions
    if conditions:
        story += [KeepTogether([Paragraph(_espace("CONDITIONS DE PAIEMENT ET DÉLAIS"), S["etiq"]), Spacer(1, 2 * mm)]
                               + [_p(f"• {c}", S["petit"]) for c in conditions]), Spacer(1, 5 * mm)]

    # ---- signatures
    def zone(titre_zone, texte):
        return [Paragraph(_espace(titre_zone), S["etiq"]), Spacer(1, 1.5 * mm), _p(texte, S["petit"]), Spacer(1, 13 * mm)]

    sign = Table([[zone("BON POUR ACCORD", "Date, nom et signature du client, précédés de la mention « Bon pour accord »."),
                   "", zone("POUR BIENFE AGENCY", "Signature et cachet.")]],
                 colWidths=[largeur / 2 - 2.5 * mm, 5 * mm, largeur / 2 - 2.5 * mm])
    sign.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.6, CIEL, None, (2, 2)), ("BOX", (2, 0), (2, 0), 0.6, CIEL, None, (2, 2)),
                              ("BACKGROUND", (0, 0), (0, 0), MENTHE), ("BACKGROUND", (2, 0), (2, 0), MENTHE),
                              ("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm), ("TOPPADDING", (0, 0), (-1, -1), 4 * mm)]))
    story += [KeepTogether(sign), Spacer(1, 4 * mm)]

    note = (f"Devis proposé par l'assistant IA d'i-Rindra"
            + (f" ({modele})" if modele else "")
            + (" et validé par la direction." if statut == "validee" else ", sous réserve de validation par la direction.")
            + f" Ce devis est valable jusqu'au {_date(valable)} ; passé ce délai, les conditions peuvent être révisées.")
    story.append(_p(note, S["petit"]))

    doc.build(story, onFirstPage=pied, onLaterPages=pied)
    return buf.getvalue()
