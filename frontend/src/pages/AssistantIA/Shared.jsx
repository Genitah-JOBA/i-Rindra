// src/pages/AssistantIA/Shared.jsx — petites briques d'UI communes aux onglets IA.
import "animate.css";

// Icône étincelles (marqueur des actions IA)
export function IconSparkles({ className = "w-5 h-5" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

// Carte blanche standard
export function Carte({ children, className = "" }) {
  return (
    <div
      className={`bg-white border border-slate-200 shadow-sm rounded-lg ${className}`}
    >
      {children}
    </div>
  );
}

// Badge « IA · <modele> »
export function BadgeIA({ modele }) {
  if (!modele) return null;
  return (
    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
      IA · {modele}
    </span>
  );
}

// Bouton d'action IA (vert, appuie sur l'étincelle)
export function BtnIA({ children, onClick, loading = false, disabled = false, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center gap-2 bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a8f2e] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <IconSparkles className="w-4 h-4" />
      {loading ? "Analyse en cours…" : children}
    </button>
  );
}

// Sélecteur de projet
export function SelectProjet({ projets, value, onChange }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E] rounded-md"
    >
      <option value="">— Sélectionner un projet —</option>
      {projets.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nom}
        </option>
      ))}
    </select>
  );
}

// Sélecteur de tâche (dépend du projet sélectionné)
export function SelectTache({ taches, value, onChange, disabled = false }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      disabled={disabled}
      className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E] rounded-md disabled:bg-slate-50 disabled:text-slate-400"
    >
      <option value="">
        {disabled
          ? "— Sélectionnez d'abord un projet —"
          : "— Sélectionner une tâche —"}
      </option>
      {taches.map((t) => (
        <option key={t.id} value={t.id}>
          {t.titre}
        </option>
      ))}
    </select>
  );
}

// Bandeau d'erreur
export function AlertErreur({ children }) {
  if (!children) return null;
  return (
    <div className="mb-4 bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 rounded-lg animate__animated animate__shakeX">
      ⚠️ {children}
    </div>
  );
}

// Indicateur de chargement
export function Spin({ label = "Chargement…" }) {
  return (
    <div className="flex justify-center items-center py-8 animate__animated animate__pulse">
      <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#63B23E]"></div>
      <span className="ml-3 text-sm text-slate-500">{label}</span>
    </div>
  );
}

// Note complémentaire d'une réponse IA (ex. « aucun membre »)
export function NoteIa({ children }) {
  if (!children) return null;
  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm rounded-lg">
      ℹ️ {children}
    </div>
  );
}

// Titre d'une section dans une carte
export function TitreSection({ children, className = "" }) {
  return (
    <h3
      className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 ${className}`}
    >
      {children}
    </h3>
  );
}

// Puces d'une liste
export function PuceList({ items = [] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-700">
          <span className="text-[#63B23E] flex-shrink-0">•</span>
          <span className="whitespace-pre-wrap">{item}</span>
        </li>
      ))}
    </ul>
  );
}