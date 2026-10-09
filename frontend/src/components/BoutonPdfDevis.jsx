// src/components/BoutonPdfDevis.jsx — télécharge le PDF d'un devis (gabarit B-esti, charte i-Rindra).
import { useState } from "react";
import { suggestionDevisService } from "../api/suggestionDevis";
import { useMessage } from "../context/MessageContext";

export default function BoutonPdfDevis({ devis, className = "" }) {
  const { showError } = useMessage();
  const [enCours, setEnCours] = useState(false);

  const telecharger = async () => {
    setEnCours(true);
    try {
      const { blob, nomFichier } = await suggestionDevisService.telechargerPdf(devis.id);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nomFichier;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch {
      showError("Impossible de générer le PDF du devis.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <button
      type="button"
      onClick={telecharger}
      disabled={enCours}
      title="Télécharger le devis en PDF"
      className={`flex items-center gap-1 border border-i-primary/20 px-2.5 py-1 text-xs font-semibold text-i-primary transition hover:border-i-blue hover:bg-[#EEFBF6] disabled:opacity-50 ${className}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      {enCours ? "PDF…" : "PDF"}
    </button>
  );
}
