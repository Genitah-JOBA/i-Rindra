// src/pages/Projets/components/ProjetCard.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { projetsService } from "../../../api/projets";

// Icônes SVG
const EyeIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const EditIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const DotsIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
  </svg>
);

const couleursStatut = {
  vert: "bg-green-100 text-green-800",
  orange: "bg-orange-100 text-orange-800",
  rouge: "bg-red-100 text-red-800",
};

const iconesStatut = {
  vert: "🟢",
  orange: "🟠",
  rouge: "🔴",
};

export default function ProjetCard({ projet, onProjetSupprime }) {
  const navigate = useNavigate();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [suppression, setSuppression] = useState(false);

  const getStatutLabel = (statut) => {
    const labels = { vert: "Bon", orange: "Attention", rouge: "Critique" };
    return labels[statut] || statut;
  };

  const handleSupprimer = async () => {
    if (window.confirm(`Voulez-vous vraiment supprimer le projet "${projet.nom}" ?`)) {
      try {
        await projetsService.delete(projet.id);
        onProjetSupprime(projet.id);
      } catch (err) {
        alert("Erreur lors de la suppression du projet.");
      }
    }
  };

  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-all duration-200">
      {/* Menu actions */}
      <div className="absolute top-2 right-2">
        <button
          onClick={() => setMenuOuvert(!menuOuvert)}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <DotsIcon className="w-5 h-5" />
        </button>
        {menuOuvert && (
          <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10">
            <button
              onClick={() => { setMenuOuvert(false); navigate(`/projets/${projet.id}`); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <EyeIcon className="w-4 h-4" />
              Voir
            </button>
            <button
              onClick={() => { setMenuOuvert(false); navigate(`/projets/${projet.id}/modifier`); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <EditIcon className="w-4 h-4" />
              Modifier
            </button>
            <button
              onClick={() => { setMenuOuvert(false); handleSupprimer(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <TrashIcon className="w-4 h-4" />
              Supprimer
            </button>
          </div>
        )}
      </div>

      {/* Contenu de la carte */}
      <div className="cursor-pointer" onClick={() => navigate(`/projets/${projet.id}`)}>
        <div className="mb-2 flex items-start justify-between gap-2 pr-6">
          <h2 className="font-semibold text-slate-900 truncate text-sm md:text-base">
            {projet.nom || "Sans nom"}
          </h2>
          <span
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap flex-shrink-0 ${
              couleursStatut[projet.statut_sante] || "bg-slate-100 text-slate-700"
            }`}
          >
            <span className="text-xs">{iconesStatut[projet.statut_sante] || "⚪"}</span>
            <span className="hidden sm:inline text-xs">{getStatutLabel(projet.statut_sante)}</span>
          </span>
        </div>

        {projet.client && (
          <div className="flex items-center gap-1 text-xs text-slate-500 mb-2 truncate">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            {projet.client}
          </div>
        )}

        {/* Barre de progression */}
        <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              (projet.avancement_pct || 0) >= 80
                ? "bg-green-500"
                : (projet.avancement_pct || 0) >= 40
                ? "bg-yellow-500"
                : "bg-blue-500"
            }`}
            style={{ width: `${projet.avancement_pct || 0}%` }}
          />
        </div>

        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-slate-500">
            {projet.avancement_pct || 0}% terminé
          </p>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {projet.taches_terminees || 0}/{projet.taches_total || 0}
          </span>
        </div>

        {projet.date_fin && (
          <div className="flex items-center gap-1 text-xs text-slate-400 mt-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            {new Date(projet.date_fin).toLocaleDateString("fr-FR")}
          </div>
        )}
      </div>
    </div>
  );
}