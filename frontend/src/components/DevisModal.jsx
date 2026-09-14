// src/components/DevisModal.jsx — modal de visualisation complète d'un devis.
// Rendu dans un <div> dans document.body via createPortal pour qu'il soit
// TOUJOURS au-dessus du header sticky du layout (évite le contenu caché).

import { createPortal } from "react-dom";
import DevisContenu from "./DevisContenu";

const LIBELLE_STATUT = {
  en_attente: "À valider",
  validee: "Validé",
  refusee: "Refusé",
};

const STYLE_STATUT = {
  en_attente: "bg-amber-100 text-amber-700",
  validee: "bg-green-100 text-green-700",
  refusee: "bg-red-100 text-red-700",
};

export default function DevisModal({ devis, onClose }) {
  const dater = (value) =>
    value ? new Date(value).toLocaleDateString("fr-FR") : "—";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate__animated animate__fadeIn">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col bg-white shadow-2xl animate__animated animate__zoomIn">
        {/* En-tête du modal */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {devis.titre ||
                  (devis.projet_nom ? `Devis ${devis.projet_nom}` : "Devis")}
              </h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  STYLE_STATUT[devis.statut] || STYLE_STATUT.en_attente
                }`}
              >
                {LIBELLE_STATUT[devis.statut] || LIBELLE_STATUT.en_attente}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
              {devis.client_nom && <span>Client : {devis.client_nom}</span>}
              {devis.projet_nom && <span>Projet : {devis.projet_nom}</span>}
              <span>Créé le {dater(devis.cree_le)}</span>
              {devis.modele && <span>IA · {devis.modele}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Fermer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Corps du devis */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="border-b border-slate-100 pb-3 mb-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Demande
            </p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">
              {devis.demande || "—"}
            </p>
          </div>
          <DevisContenu contenu={devis.contenu_devis} />
        </div>

        {/* Pied du modal */}
        <div className="border-t border-slate-200 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}