// src/utils/exportFacturesPdf.js — export PDF de la liste des factures, aux
// couleurs de la charte i-Rindra (bandeau bleu nuit, liseré dégradé, logo).
//
// La devise est celle du CLIENT de chaque facture : les montants ne sont jamais
// additionnés entre devises différentes (un total par devise).

const NUIT = [11, 34, 65];
const CIEL = [79, 176, 241];
const VERT = [125, 249, 121];
const TURQUOISE = [122, 253, 242];
const MENTHE = [238, 251, 246];
const GRIS = [100, 116, 139];

const LIBELLES = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const COULEUR_STATUT = {
  brouillon: GRIS,
  envoyee: [37, 99, 235],
  payee: [22, 128, 61],
  en_retard: [220, 38, 38],
  annulee: [148, 163, 184],
};

// Intl « fr-FR » sépare les milliers par une espace fine insécable (U+202F),
// absente des polices standard du PDF : elle s'imprimait en caractères parasites.
function montant(n) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(n || 0))
    .replace(/[\u202f\u00a0]/g, " ");
}

function dateFr(iso) {
  if (!iso) return "—";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return j && m && a ? `${j}/${m}/${a}` : iso;
}

// Logo chargé depuis /public et ramené à 160 px de haut : jsPDF intègre les PNG
// en pixels bruts, un logo pleine résolution alourdissait le fichier de plusieurs Mo.
// Retourne null si le logo est introuvable (le titre texte prend alors le relais).
async function chargerLogo(url, hauteurPx = 160) {
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = url;
    });
    const ratio = img.width / img.height;
    const canvas = document.createElement("canvas");
    canvas.height = hauteurPx;
    canvas.width = Math.round(hauteurPx * ratio);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), ratio };
  } catch {
    return null;
  }
}

export async function exportFacturesPdf({ factures, clients }) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const deviseDuClient = Object.fromEntries((clients || []).map((c) => [c.id, c.devise || "Ar"]));
  const devise = (f) => deviseDuClient[f.client_id] || "Ar";

  const doc = new jsPDF("landscape", "mm", "a4");
  const L = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const maintenant = new Date();

  // ---------- En-tête : bandeau bleu nuit + liseré dégradé + logo ----------
  doc.setFillColor(...NUIT);
  doc.rect(0, 0, L, 28, "F");
  [CIEL, VERT, TURQUOISE].forEach((c, i) => {
    doc.setFillColor(...c);
    doc.rect((i * L) / 3, 28, L / 3, 1.6, "F");
  });

  const logo = await chargerLogo("/Logo-i-Rindra-text-Blanc.png");
  if (logo) {
    const h = 11;
    doc.addImage(logo.dataUrl, "PNG", 14, (28 - h) / 2, h * logo.ratio, h, undefined, "FAST");
  } else {
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(255, 255, 255);
    doc.text("i-Rindra", 14, 17);
  }

  doc.setFont("helvetica", "bold").setFontSize(17).setTextColor(255, 255, 255);
  doc.text("Liste des factures", L - 14, 13, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...TURQUOISE);
  doc.text(
    `Générée le ${maintenant.toLocaleDateString("fr-FR")} à ${maintenant
      .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    L - 14, 20, { align: "right" },
  );

  // ---------- Synthèse : 4 cartes ----------
  const totaux = {}; // TTC par devise
  factures.forEach((f) => {
    if (f.statut === "annulee") return;
    totaux[devise(f)] = (totaux[devise(f)] || 0) + Number(f.montant_ttc || 0);
  });
  const nb = (s) => factures.filter((f) => f.statut === s).length;
  const cartes = [
    { titre: "Factures", valeur: String(factures.length), couleur: CIEL },
    { titre: "Payées", valeur: String(nb("payee")), couleur: COULEUR_STATUT.payee },
    { titre: "En attente de paiement", valeur: String(nb("envoyee") + nb("en_retard")), couleur: [217, 119, 6] },
    {
      titre: "Total TTC (hors annulées)",
      valeur: Object.entries(totaux).map(([d, t]) => `${montant(t)} ${d}`).join("  ·  ") || "0,00",
      couleur: VERT,
    },
  ];
  const y0 = 36, hCarte = 18, ecart = 5;
  const largeurs = [45, 45, 55, L - 28 - 45 - 45 - 55 - 3 * ecart];
  let x = 14;
  cartes.forEach((c, i) => {
    const w = largeurs[i];
    doc.setFillColor(...MENTHE);
    doc.rect(x, y0, w, hCarte, "F");
    doc.setFillColor(...c.couleur);
    doc.rect(x, y0, 1.4, hCarte, "F");
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
    doc.text(c.titre.toUpperCase(), x + 5, y0 + 6.5);
    doc.setFont("helvetica", "bold").setFontSize(i === 3 ? 11 : 14).setTextColor(...NUIT);
    doc.text(c.valeur, x + 5, y0 + 14, { maxWidth: w - 8 });
    x += w + ecart;
  });

  // ---------- Tableau ----------
  const lignes = factures.map((f) => [
    f.numero,
    f.client_nom || `#${f.client_id}`,
    f.projet_nom || "—",
    dateFr(f.date_emission),
    dateFr(f.date_echeance),
    `${montant(f.montant_ttc)} ${devise(f)}`,
    LIBELLES[f.statut] || f.statut,
  ]);
  const pied = Object.entries(totaux).map(([d, t]) => [
    { content: `Total TTC (${d})`, colSpan: 5, styles: { halign: "right" } },
    { content: `${montant(t)} ${d}`, styles: { halign: "right" } },
    "",
  ]);

  autoTable(doc, {
    head: [["N°", "Client", "Projet", "Émission", "Échéance", "Total TTC", "Statut"]],
    body: lignes,
    foot: pied,
    startY: y0 + hCarte + 8,
    margin: { left: 14, right: 14, bottom: 18 },
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, textColor: NUIT, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    headStyles: { fillColor: NUIT, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: MENTHE },
    footStyles: { fillColor: [220, 243, 236], textColor: NUIT, fontStyle: "bold" },
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 32, fontStyle: "bold" },
      3: { cellWidth: 26 },
      4: { cellWidth: 26 },
      5: { cellWidth: 42, halign: "right" },
      6: { cellWidth: 28 },
    },
    didParseCell: (d) => {
      // En-tête « Total TTC » aligné à droite, comme ses montants
      if (d.section === "head" && d.column.index === 5) d.cell.styles.halign = "right";
      // Statut coloré selon son état
      if (d.section === "body" && d.column.index === 6) {
        const statut = factures[d.row.index]?.statut;
        d.cell.styles.textColor = COULEUR_STATUT[statut] || NUIT;
        d.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      // Pied de page : filet + mentions
      doc.setDrawColor(...CIEL).setLineWidth(0.3);
      doc.line(14, H - 12, L - 14, H - 12);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
      doc.text("i-Rindra — Gestion de projets assistée par l'IA · Bienfe Agency", 14, H - 7);
    },
  });

  // Numérotation « Page x / n » (connue seulement une fois le tableau dessiné)
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
    doc.text(`Page ${i} / ${total}`, L - 14, H - 7, { align: "right" });
  }

  doc.save(`factures_${maintenant.toISOString().slice(0, 10)}.pdf`);
}
