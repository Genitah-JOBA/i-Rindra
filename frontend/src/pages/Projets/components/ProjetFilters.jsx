// src/pages/Projets/components/ProjetFilters.jsx
import { useState } from "react";

// Icônes SVG
const SearchIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const CloseIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function ProjetFilters({ filtres, onFiltreChange, totalProjets }) {
  const [rechercheLocale, setRechercheLocale] = useState(filtres.recherche);

  const handleStatutClick = (statut) => {
    onFiltreChange({ statut: statut === filtres.statut ? "tous" : statut });
  };

  const handleRechercheSubmit = (e) => {
    e.preventDefault();
    onFiltreChange({ recherche: rechercheLocale });
  };

  const handleRechercheClear = () => {
    setRechercheLocale("");
    onFiltreChange({ recherche: "" });
  };

  const statuts = [
    { id: "tous", label: "Tous", color: "bg-slate-100 text-slate-700" },
    { id: "enCours", label: "En cours", color: "bg-blue-100 text-blue-700" },
    { id: "termines", label: "Terminés", color: "bg-green-100 text-green-700" },
    { id: "enRetard", label: "En retard", color: "bg-red-100 text-red-700" },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      {/* Filtres statut */}
      <div className="flex flex-wrap gap-1.5">
        {statuts.map((s) => (
          <button
            key={s.id}
            onClick={() => handleStatutClick(s.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filtres.statut === s.id
                ? s.color + " ring-2 ring-offset-1 ring-slate-300"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Recherche et compteur */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {totalProjets} projet{totalProjets > 1 ? "s" : ""}
        </span>
        <form onSubmit={handleRechercheSubmit} className="relative">
          <input
            type="text"
            value={rechercheLocale}
            onChange={(e) => setRechercheLocale(e.target.value)}
            placeholder="Rechercher un projet..."
            className="w-48 sm:w-56 pl-8 pr-8 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
          />
          <SearchIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          {rechercheLocale && (
            <button
              type="button"
              onClick={handleRechercheClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}