// src/components/FactureModal.jsx — détail d'une facture + téléchargement de son PDF
// (gabarit des devis, charte i-Rindra). Montants affichés dans la devise du client.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { facturesService } from "../api/factures";
import { useMessage } from "../context/MessageContext";

const STATUTS = {
  brouillon: { libelle: "Brouillon", style: "bg-slate-100 text-slate-600" },
  envoyee: { libelle: "Envoyée", style: "bg-blue-100 text-blue-800" },
  payee: { libelle: "Payée", style: "bg-i-green/25 text-i-primary" },
  en_retard: { libelle: "En retard", style: "bg-red-100 text-red-800" },
  annulee: { libelle: "Annulée", style: "bg-slate-100 text-slate-400" },
};

function montant(v, devise) {
  return (
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number(v || 0),
    ) + ` ${devise}`
  );
}

function dateFr(iso) {
  if (!iso) return "—";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

function Ligne({ libelle, valeur, fort = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-500">{libelle}</span>
      <span className={`text-right text-sm ${fort ? "font-bold text-i-primary" : "text-slate-800"}`}>{valeur}</span>
    </div>
  );
}

export default function FactureModal({ facture, devise = "Ar", onClose, onModifier }) {
  const { showError } = useMessage();
  const [enCours, setEnCours] = useState(false);
  const statut = STATUTS[facture.statut] || STATUTS.brouillon;

  // Échap ferme la fenêtre
  useEffect(() => {
    const surTouche = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onClose]);

  const telecharger = async () => {
    setEnCours(true);
    try {
      const reponse = await facturesService.telechargerPdf(facture.id);
      const disposition = reponse.headers?.["content-disposition"] || "";
      const nom = /filename="?([^";]+)"?/.exec(disposition)?.[1] || `facture-${facture.numero}.pdf`;
      const url = URL.createObjectURL(reponse.data);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch {
      showError("Impossible de générer le PDF de la facture.");
    } finally {
      setEnCours(false);
    }
  };

  // Portal : au-dessus de l'en-tête collant, quel que soit l'endroit où la page est rendue
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-i-primary/60 p-4 backdrop-blur-[2px] animate__animated animate__fadeIn animate__faster"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="facture-titre"
        className="w-full max-w-lg overflow-hidden bg-white shadow-2xl animate__animated animate__zoomIn animate__faster"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 bg-gradient-to-r from-i-blue via-i-green to-i-turquoise" />

        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-i-blue">Facture</p>
            <h2 id="facture-titre" className="font-brand text-xl font-bold text-i-primary">
              {facture.numero}
            </h2>
          </div>
          <span className={`px-2.5 py-1 text-xs font-semibold ${statut.style}`}>{statut.libelle}</span>
        </div>

        {/* Client / projet */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-4">
          <div className="border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-i-blue">Facturé à</p>
            <p className="mt-1 text-sm font-semibold text-i-primary">
              {facture.client_nom || `#${facture.client_id}`}
            </p>
          </div>
          <div className="border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-i-blue">Projet</p>
            <p className="mt-1 text-sm font-semibold text-i-primary">{facture.projet_nom || "—"}</p>
          </div>
        </div>

        {/* Détail */}
        <div className="px-6 pt-4">
          <Ligne libelle="Date d'émission" valeur={dateFr(facture.date_emission)} />
          <Ligne libelle="Échéance" valeur={dateFr(facture.date_echeance)} />
          <div className="my-2 border-t border-slate-100" />
          <Ligne libelle="Montant HT" valeur={montant(facture.montant_ht, devise)} />
          <Ligne libelle={`TVA (${Number(facture.taux_tva || 0).toLocaleString("fr-FR")} %)`} valeur={montant(facture.montant_tva, devise)} />
          <div className="mt-2 flex items-center justify-between bg-gradient-to-r from-i-blue via-i-green to-i-turquoise px-4 py-2.5">
            <span className="text-sm font-bold text-i-primary">Total TTC</span>
            <span className="text-base font-bold text-i-primary">{montant(facture.montant_ttc, devise)}</span>
          </div>
          {facture.notes && (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-i-blue">Notes</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{facture.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-i-turquoise/40 bg-[#EEFBF6] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="border border-i-primary/20 bg-white px-4 py-2 text-sm font-medium text-i-primary transition-colors hover:border-i-primary/40 hover:bg-slate-50"
          >
            Fermer
          </button>
          {onModifier && (
            <button
              type="button"
              onClick={onModifier}
              className="border border-i-primary/20 bg-white px-4 py-2 text-sm font-medium text-i-primary transition-colors hover:border-i-blue"
            >
              Modifier
            </button>
          )}
          <button
            type="button"
            onClick={telecharger}
            disabled={enCours}
            className="flex items-center gap-2 bg-gradient-to-r from-i-blue to-i-green px-4 py-2 text-sm font-semibold text-i-primary transition-all hover:shadow-lg disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {enCours ? "Génération…" : "Télécharger le PDF"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
