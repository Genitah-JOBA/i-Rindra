// src/components/Spin.jsx
// Indicateur de chargement partagé (extrait de pages/AssistantIA/Shared.jsx
// pour être réutilisé par toutes les pages). `taille` permet d'ajuster le
// spinner selon le contexte (plein écran, bloc, modale).
import "animate.css";

const TAILLES = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-8 w-8",
};

export default function Spin({ label = "Chargement…", taille = "md", className = "" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center py-8 animate__animated animate__pulse ${className}`}
    >
      <div
        className={`animate-spin rounded-full border-b-2 border-i-blue ${
          TAILLES[taille] || TAILLES.md
        }`}
      />
      {label && <span className="ml-3 text-sm text-slate-500">{label}</span>}
    </div>
  );
}