// src/pages/Facturation.jsx — volet financier : factures clients (ADMIN uniquement).
import { useEffect, useState, useRef } from "react";
import { facturesService } from "../api/factures";
import { clientsService } from "../api/client";
import { projetsService } from "../api/projets";
import { useLang } from "../i18n/LangContext";
import { useMessage } from "../context/MessageContext";

// Devise d'affichage — modifiable en un seul endroit.
const DEVISE = "Ar";

const STATUTS = ["brouillon", "envoyee", "payee", "en_retard", "annulee"];

// Couleurs par statut (badge + select)
const STATUT_STYLE = {
  brouillon: "bg-slate-100 text-slate-600 border-slate-200",
  envoyee: "bg-blue-100 text-blue-700 border-blue-200",
  payee: "bg-emerald-100 text-emerald-700 border-emerald-200",
  en_retard: "bg-red-100 text-red-700 border-red-200",
  annulee: "bg-slate-100 text-slate-400 border-slate-200 line-through",
};

const FORM_VIDE = {
  client_id: "",
  projet_id: "",
  date_emission: new Date().toISOString().slice(0, 10),
  date_echeance: "",
  montant_ht: "",
  taux_tva: "20",
  notes: "",
};

function formatMontant(n) {
  const v = Number(n || 0);
  return (
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) + ` ${DEVISE}`
  );
}

// Fonction pour formater le montant sans devise (pour les exports)
function formatMontantSimple(n) {
  const v = Number(n || 0);
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

// Fonction pour obtenir la date d'aujourd'hui au format YYYY-MM-DD
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// Fonction pour ajouter X jours à une date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

export default function Facturation() {
  const { t } = useLang();
  const { showSuccess, showError, showWarning, showInfo } = useMessage();
  const tableRef = useRef(null);

  const [factures, setFactures] = useState([]);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [dateEmissionError, setDateEmissionError] = useState("");
  const [dateEcheanceError, setDateEcheanceError] = useState("");

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const params = filtreStatut ? { statut: filtreStatut } : {};
      const [facts, st] = await Promise.all([
        facturesService.list(params),
        facturesService.stats().catch(() => null),
      ]);
      setFactures(facts || []);
      setStats(st);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Listes déroulantes (chargées une fois)
  const chargerReferentiels = async () => {
    try {
      const [cl, pr] = await Promise.all([
        clientsService.list().catch(() => []),
        projetsService.list().catch(() => []),
      ]);
      setClients(cl || []);
      setProjets(pr || []);
    } catch (err) {
      console.error("Erreur chargement référentiels:", err);
    }
  };

  useEffect(() => {
    chargerReferentiels();
  }, []);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreStatut]);

  // TTC calculé en direct dans la modale
  const ttcApercu = () => {
    const ht = parseFloat(form.montant_ht) || 0;
    const taux = parseFloat(form.taux_tva) || 0;
    return ht + (ht * taux) / 100;
  };

  const ouvrirAjout = () => {
    setEditionId(null);
    const today = getToday();
    setForm({
      ...FORM_VIDE,
      client_id: "",
      projet_id: "",
      date_emission: today,
      date_echeance: addDays(today, 30),
      montant_ht: "",
      taux_tva: "20",
    });
    setFormErreur("");
    setDateEmissionError("");
    setDateEcheanceError("");
    setModalOuvert(true);
  };

  const ouvrirEdition = (f) => {
    setEditionId(f.id);
    setForm({
      client_id: String(f.client_id ?? ""),
      projet_id: f.projet_id ? String(f.projet_id) : "",
      date_emission: f.date_emission || getToday(),
      date_echeance: f.date_echeance || addDays(getToday(), 30),
      montant_ht: String(f.montant_ht ?? ""),
      taux_tva: String(f.taux_tva ?? "20"),
      notes: f.notes || "",
    });
    setFormErreur("");
    setDateEmissionError("");
    setDateEcheanceError("");
    setModalOuvert(true);
  };

  const validateDates = () => {
    const today = getToday();
    let isValid = true;

    if (form.date_emission && form.date_emission > today) {
      setDateEmissionError("La date d'émission ne peut pas être dans le futur");
      isValid = false;
    } else {
      setDateEmissionError("");
    }

    if (form.date_echeance && form.date_echeance < today) {
      setDateEcheanceError("La date d'échéance ne peut pas être dans le passé");
      isValid = false;
    } else {
      setDateEcheanceError("");
    }

    if (form.date_emission && form.date_echeance && form.date_echeance < form.date_emission) {
      setDateEcheanceError("La date d'échéance doit être après la date d'émission");
      isValid = false;
    }

    return isValid;
  };

  const enregistrer = async (ev) => {
    ev.preventDefault();
    setFormErreur("");
    setDateEmissionError("");
    setDateEcheanceError("");

    if (!form.client_id) {
      const msg = "Le client est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.projet_id) {
      const msg = "Le projet est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_emission) {
      const msg = "La date d'émission est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_echeance) {
      const msg = "La date d'échéance est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.montant_ht || parseFloat(form.montant_ht) <= 0) {
      const msg = "Le montant HT est obligatoire et doit être supérieur à 0";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.taux_tva || parseFloat(form.taux_tva) < 0) {
      const msg = "Le taux de TVA est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }

    if (!validateDates()) {
      if (dateEmissionError) showError(dateEmissionError);
      if (dateEcheanceError) showError(dateEcheanceError);
      return;
    }

    setEnregistrement(true);
    try {
      const payload = {
        client_id: Number(form.client_id),
        projet_id: Number(form.projet_id),
        date_emission: form.date_emission || null,
        date_echeance: form.date_echeance || null,
        montant_ht: parseFloat(form.montant_ht) || 0,
        taux_tva: parseFloat(form.taux_tva) || 0,
        notes: form.notes || null,
      };
      if (editionId) {
        await facturesService.update(editionId, payload);
        showSuccess("La facture a été modifiée avec succès !");
      } else {
        await facturesService.create(payload);
        showSuccess("La facture a été créée avec succès !");
      }
      setModalOuvert(false);
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de l'enregistrement.";
      setFormErreur(msg);
      showError(msg);
    } finally {
      setEnregistrement(false);
    }
  };

  const changerStatut = async (f, statut) => {
    try {
      await facturesService.setStatut(f.id, statut);
      showSuccess(
        `Statut de la facture ${f.numero} mis à jour : ${t(`fact.statut.${statut}`)}`
      );
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Impossible de changer le statut.";
      showError(msg);
    }
  };

  // ✅ Confirmation de suppression avec MessageBox
  const supprimer = async (f) => {
    // Créer une confirmation personnalisée
    const confirmed = await new Promise((resolve) => {
      const container = document.createElement("div");
      container.className =
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate__animated animate__fadeIn";
      document.body.appendChild(container);

      const ConfirmationDialog = () => {
        const [visible, setVisible] = useState(true);

        const handleConfirm = () => {
          setVisible(false);
          setTimeout(() => {
            if (container.parentNode) {
              container.parentNode.removeChild(container);
            }
            resolve(true);
          }, 300);
        };

        const handleCancel = () => {
          setVisible(false);
          setTimeout(() => {
            if (container.parentNode) {
              container.parentNode.removeChild(container);
            }
            resolve(false);
          }, 300);
        };

        return (
          <div
            className={`bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate__animated animate__zoomIn ${
              !visible ? "animate__animated animate__zoomOut" : ""
            }`}
          >
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-lg font-semibold">Confirmation de suppression</h3>
            </div>
            <p className="text-slate-600 mb-2">{t("fact.suppr")}</p>
            <p className="font-mono text-sm text-slate-800 bg-slate-50 p-2 rounded mb-4">
              {f.numero} - {f.client_nom}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        );
      };

      import("react-dom/client").then(({ createRoot }) => {
        const root = createRoot(container);
        root.render(<ConfirmationDialog />);
      });
    });

    if (!confirmed) return;

    try {
      await facturesService.remove(f.id);
      showSuccess(`La facture ${f.numero} a été supprimée.`);
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Suppression impossible.";
      showError(msg);
    }
  };

  const carte = (label, valeur, couleur) => (
    <div className="border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${couleur}`}>{valeur}</p>
    </div>
  );

  // ========== FONCTIONS D'EXPORTATION ==========

  // Export PDF
  const exportPDF = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF("landscape", "mm", "a4");

      doc.setFontSize(18);
      doc.setTextColor(99, 178, 62);
      doc.text("Liste des factures", 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(
        `Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString(
          "fr-FR"
        )}`,
        14,
        30
      );

      const tableData = factures.map((f) => [
        f.numero,
        f.client_nom || `#${f.client_id}`,
        f.projet_nom || "—",
        f.date_emission || "",
        f.date_echeance || "—",
        formatMontantSimple(f.montant_ttc),
        t(`fact.statut.${f.statut}`) || f.statut,
      ]);

      autoTable(doc, {
        head: [
          [
            t("fact.col.numero"),
            t("fact.col.client"),
            t("fact.col.projet"),
            t("fact.col.emission"),
            t("fact.col.echeance"),
            `${t("fact.col.ttc")} (${DEVISE})`,
            t("fact.col.statut"),
          ],
        ],
        body: tableData,
        startY: 35,
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [99, 178, 62],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 30 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 30, halign: "right" },
          6: { cellWidth: 25 },
        },
        footStyles: {
          fillColor: [99, 178, 62],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "right",
        },
      });

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} / ${pageCount} - i-Rindra | ${DEVISE}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      }

      doc.save(`factures_${new Date().toISOString().slice(0, 10)}.pdf`);
      showSuccess("PDF exporté avec succès !");
    } catch (err) {
      showError("Erreur lors de l'export PDF. Vérifiez que jspdf est installé.");
      console.error(err);
    }
  };

  // Export Excel
  const exportExcel = () => {
    try {
      const headers = [
        t("fact.col.numero"),
        t("fact.col.client"),
        t("fact.col.projet"),
        t("fact.col.emission"),
        t("fact.col.echeance"),
        `${t("fact.col.ttc")} (${DEVISE})`,
        t("fact.col.statut"),
      ];

      const rows = factures.map((f) => [
        f.numero,
        f.client_nom || `#${f.client_id}`,
        f.projet_nom || "—",
        f.date_emission || "",
        f.date_echeance || "—",
        formatMontantSimple(f.montant_ttc),
        t(`fact.statut.${f.statut}`) || f.statut,
      ]);

      let csvContent = "\uFEFF";
      csvContent += headers.join(";") + "\n";
      rows.forEach((row) => {
        csvContent += row.join(";") + "\n";
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `factures_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      showSuccess("Fichier Excel exporté avec succès !");
    } catch (err) {
      showError("Erreur lors de l'export Excel.");
      console.error(err);
    }
  };

  // Export Word
  const exportWord = () => {
    try {
      const totalTTC = factures.reduce((sum, f) => sum + (f.montant_ttc || 0), 0);
      const totalFactures = factures.length;
      const totalPayees = factures.filter((f) => f.statut === "payee").length;

      let htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' 
              xmlns:w='urn:schemas-microsoft-com:office:word' 
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset="utf-8">
          <title>Liste des factures</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11pt; margin: 40px; }
            h1 { color: #63B23E; font-size: 20pt; }
            .date { font-size: 10pt; color: #666; margin-top: 5px; margin-bottom: 20px; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th { 
              background-color: #63B23E; 
              color: white; 
              font-weight: bold; 
              padding: 10px 8px; 
              border: 1px solid #63B23E;
              text-align: left;
              font-size: 10pt;
            }
            td { 
              padding: 8px; 
              border: 1px solid #ccc; 
              font-size: 10pt;
            }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { 
              margin-top: 30px; 
              font-size: 10pt; 
              color: #666; 
              text-align: center; 
              border-top: 2px solid #63B23E;
              padding-top: 15px;
            }
            .totaux { 
              margin-top: 25px; 
              background-color: #e8f5e9; 
              padding: 15px;
              border: 2px solid #63B23E;
              border-radius: 5px;
            }
            .totaux p { margin: 5px 0; }
            .totaux .label { font-weight: bold; color: #333; }
            .totaux .value { color: #63B23E; font-weight: bold; font-size: 12pt; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row { background-color: #e8f5e9 !important; font-weight: bold; }
            .total-row td { border-color: #63B23E; }
          </style>
        </head>
        <body>
          <h1>Liste des factures</h1>
          <p class="date">Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString(
        "fr-FR"
      )}</p>
          
          <table>
            <thead>
              <tr>
                <th>${t("fact.col.numero")}</th>
                <th>${t("fact.col.client")}</th>
                <th>${t("fact.col.projet")}</th>
                <th>${t("fact.col.emission")}</th>
                <th>${t("fact.col.echeance")}</th>
                <th class="text-right">${t("fact.col.ttc")} (${DEVISE})</th>
                <th>${t("fact.col.statut")}</th>
              </tr>
            </thead>
            <tbody>
      `;

      factures.forEach((f) => {
        htmlContent += `
          <tr>
            <td>${f.numero}</td>
            <td>${f.client_nom || `#${f.client_id}`}</td>
            <td>${f.projet_nom || "—"}</td>
            <td>${f.date_emission || ""}</td>
            <td>${f.date_echeance || "—"}</td>
            <td class="text-right">${formatMontantSimple(f.montant_ttc)}</td>
            <td>${t(`fact.statut.${f.statut}`) || f.statut}</td>
          </tr>
        `;
      });

      htmlContent += `
              <tr class="total-row">
                <td colspan="5" class="text-right">TOTAL TTC :</td>
                <td class="text-right">${formatMontantSimple(totalTTC)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          
          <div class="totaux">
            <p><span class="label">📊 Résumé :</span></p>
            <p><span class="label">Total factures :</span> <span class="value">${totalFactures}</span></p>
            <p><span class="label">Total TTC :</span> <span class="value">${formatMontantSimple(
              totalTTC
            )} ${DEVISE}</span></p>
            <p><span class="label">Factures payées :</span> <span class="value">${totalPayees}</span></p>
          </div>
          
          <div class="footer">
            <strong>i-Rindra</strong> - Gestion de projets assistée par l'IA<br>
            Document généré automatiquement le ${new Date().toLocaleDateString("fr-FR")}
          </div>
        </body>
        </html>
      `;

      const blob = new Blob([htmlContent], {
        type: "application/msword;charset=utf-8",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `factures_${new Date().toISOString().slice(0, 10)}.doc`;
      link.click();
      URL.revokeObjectURL(link.href);
      showSuccess("Document Word exporté avec succès !");
    } catch (err) {
      showError("Erreur lors de l'export Word.");
      console.error(err);
    }
  };

  // ========== RENDU ==========

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("fact.titre")}
          </h1>
          <p className="text-sm text-slate-500">{t("fact.sousTitre")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            <button
              onClick={exportPDF}
              disabled={factures.length === 0}
              className="flex items-center gap-1 bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              title="Exporter en PDF"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v6a2 2 0 002 2h6"
                />
              </svg>
              PDF
            </button>
            <button
              onClick={exportExcel}
              disabled={factures.length === 0}
              className="flex items-center gap-1 bg-green-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
              title="Exporter en Excel (CSV)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 17v-2m3 2v-4m3 4v-6m-6 6v-2.5m6 2.5v-6M3 6v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              Excel
            </button>
            <button
              onClick={exportWord}
              disabled={factures.length === 0}
              className="flex items-center gap-1 bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              title="Exporter en Word"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              Word
            </button>
          </div>
          <button
            onClick={ouvrirAjout}
            className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a8f2e]"
          >
            + {t("fact.nouvelle")}
          </button>
        </div>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {carte(
            t("fact.stats.ca"),
            formatMontant(stats.ca_encaisse),
            "text-emerald-600"
          )}
          {carte(
            t("fact.stats.attente"),
            formatMontant(stats.en_attente),
            "text-blue-600"
          )}
          {carte(t("fact.stats.total"), stats.total_factures, "text-slate-800")}
          {carte(t("fact.stats.impayees"), stats.impayees, "text-red-600")}
        </div>
      )}

      {/* Filtre */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E]"
        >
          <option value="">{t("fact.filtre.tous")}</option>
          {STATUTS.map((s) => (
            <option key={s} value={s}>
              {t(`fact.statut.${s}`)}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {factures.length} facture{factures.length > 1 ? "s" : ""}
        </span>
      </div>

      {loading && <p className="text-slate-500">{t("common.chargement")}</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && (
        <div className="overflow-x-auto border bg-white shadow-sm" ref={tableRef}>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("fact.col.numero")}</th>
                <th className="px-4 py-3">{t("fact.col.client")}</th>
                <th className="px-4 py-3">{t("fact.col.projet")}</th>
                <th className="px-4 py-3">{t("fact.col.emission")}</th>
                <th className="px-4 py-3">{t("fact.col.echeance")}</th>
                <th className="px-4 py-3 text-right">{t("fact.col.ttc")}</th>
                <th className="px-4 py-3">{t("fact.col.statut")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {factures.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                    {f.numero}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {f.client_nom || `#${f.client_id}`}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {f.projet_nom || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{f.date_emission}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {f.date_echeance || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {formatMontant(f.montant_ttc)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={f.statut}
                      onChange={(e) => changerStatut(f, e.target.value)}
                      className={`border px-2 py-1 text-xs font-medium outline-none ${
                        STATUT_STYLE[f.statut] || ""
                      }`}
                    >
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>
                          {t(`fact.statut.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        onClick={() => ouvrirEdition(f)}
                        className="text-slate-500 hover:text-[#63B23E]"
                      >
                        {t("common.modifier")}
                      </button>
                      <button
                        onClick={() => supprimer(f)}
                        className="text-slate-500 hover:text-red-600"
                      >
                        {t("common.supprimer")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {factures.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {t("fact.vide")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALE AJOUT / ÉDITION AVEC PROJET OBLIGATOIRE */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-lg bg-white p-6 shadow-xl animate__animated animate__zoomIn">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editionId ? t("fact.modal.edition") : t("fact.modal.ajout")}
            </h2>
            <form onSubmit={enregistrer} className="space-y-3">
              {(formErreur || dateEmissionError || dateEcheanceError) && (
                <div className="bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                  {formErreur && <p>⚠️ {formErreur}</p>}
                  {dateEmissionError && <p>⚠️ {dateEmissionError}</p>}
                  {dateEcheanceError && <p>⚠️ {dateEcheanceError}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Entreprise {t("fact.form.client")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.client_id}
                    onChange={(e) => {
                      const clientId = e.target.value;
                      setForm({
                        ...form,
                        client_id: clientId,
                        projet_id: "",
                      });
                    }}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E]"
                  >
                    <option value="">— Sélectionner un client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.projet")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.projet_id}
                    onChange={(e) =>
                      setForm({ ...form, projet_id: e.target.value })
                    }
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E]"
                    disabled={!form.client_id}
                  >
                    <option value="">
                      {form.client_id
                        ? "— Sélectionner un projet —"
                        : "— Sélectionnez d'abord un client —"}
                    </option>
                    {projets
                      .filter((p) => {
                        if (!form.client_id) return false;
                        return String(p.client_id) === String(form.client_id);
                      })
                      .map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.nom}
                        </option>
                      ))}
                  </select>
                  {form.client_id &&
                    projets.filter(
                      (p) => String(p.client_id) === String(form.client_id)
                    ).length === 0 && (
                      <p className="mt-1 text-xs text-amber-600">
                        ⚠️ Aucun projet trouvé pour ce client
                      </p>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.emission")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date_emission}
                    onChange={(e) => {
                      setForm({ ...form, date_emission: e.target.value });
                      setDateEmissionError("");
                    }}
                    max={getToday()}
                    required
                    className={`w-full border px-3 py-2 text-sm outline-none focus:border-[#63B23E] ${
                      dateEmissionError ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Date d'émission (max: aujourd'hui)
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.echeance")}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date_echeance}
                    onChange={(e) => {
                      setForm({ ...form, date_echeance: e.target.value });
                      setDateEcheanceError("");
                    }}
                    min={getToday()}
                    required
                    className={`w-full border px-3 py-2 text-sm outline-none focus:border-[#63B23E] ${
                      dateEcheanceError ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Date d'échéance (min: aujourd'hui)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.ht")} ({DEVISE}){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.montant_ht}
                    onChange={(e) =>
                      setForm({ ...form, montant_ht: e.target.value })
                    }
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E]"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.tva")} (%){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.taux_tva}
                    onChange={(e) =>
                      setForm({ ...form, taux_tva: e.target.value })
                    }
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E]"
                    placeholder="20"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-3 py-2 text-right text-sm">
                <span className="text-slate-500">{t("fact.form.ttc")} : </span>
                <span className="font-semibold text-slate-800">
                  {formatMontant(ttcApercu())}
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("fact.form.notes")}
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E]"
                  placeholder="Notes optionnelles..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {t("common.annuler")}
                </button>
                <button
                  type="submit"
                  disabled={enregistrement}
                  className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a8f2e] disabled:opacity-50"
                >
                  {enregistrement
                    ? t("common.enregistrement")
                    : t("common.enregistrer")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}