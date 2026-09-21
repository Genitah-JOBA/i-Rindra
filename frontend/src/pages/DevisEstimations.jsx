// src/pages/DevisEstimations.jsx — devis & estimations (direction / DRH).
// Les devis générés par l'IA et validés sont centralisés ici.
// Lien vers l'outil externe B-estimation en tête de page.
import { useEffect, useState } from "react";
import { suggestionDevisService } from "../api/suggestionDevis";
import { useMessage } from "../context/MessageContext";
import DevisModal from "../components/DevisModal";
import "animate.css";

const B_ESTIMATION_URL = "https://b-estimation.example.com";

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

export default function DevisEstimations() {
  const { showError } = useMessage();
  const [devis, setDevis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [devisDetail, setDevisDetail] = useState(null);

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      setDevis((await suggestionDevisService.list("validee")) || []);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dater = (value) =>
    value ? new Date(value).toLocaleDateString("fr-FR") : "—";

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
            Devis & Estimations
          </h1>
          <p className="text-sm text-slate-500">
            Devis validés par la direction/DRH — les suggestions en attente de
            validation restent dans Suggestion devis par IA.
          </p>
        </div>
        <a
          href={B_ESTIMATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 border border-i-blue px-4 py-2 text-sm font-semibold text-i-blue transition hover:bg-brand-gradient hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h12m-12 2.25h12M3.375 4.5h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 01-1.125-1.125V5.625c0-.621.504-1.125 1.125-1.125z"
            />
          </svg>
          Ouvrir B-estimation
        </a>
      </div>

      {/* Chargement */}
      {loading && (
        <div className="flex justify-center items-center py-12 animate__animated animate__pulse">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-i-blue"></div>
          <span className="ml-3 text-slate-500">Chargement…</span>
        </div>
      )}

      {/* Erreur */}
      {erreur && (
        <div className="mb-4 bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 animate__animated animate__shakeX">
          âš ï¸ {erreur}
        </div>
      )}

      {/* Liste */}
      {!loading && !erreur && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {devis.length === 0 && (
            <div className="lg:col-span-2 text-center py-12 bg-slate-50 border border-slate-200 animate__animated animate__fadeInUp">
              <p className="text-slate-500">
                Aucun devis validé pour le moment. Validez un devis suggéré par
                l'IA depuis Suggestion devis par IA pour le retrouver ici.
              </p>
            </div>
          )}

          {devis.map((d, index) => (
            <div
              key={d.id}
              className="animate__animated animate__fadeInUp"
              style={{ animationDelay: `${0.05 + index * 0.05}s` }}
            >
              <div className="bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-i-blue transition-all duration-300 flex flex-col h-full">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {d.titre ||
                          (d.projet_nom ? `Devis ${d.projet_nom}` : "Devis")}
                      </h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          STYLE_STATUT[d.statut] || STYLE_STATUT.en_attente
                        }`}
                      >
                        {LIBELLE_STATUT[d.statut] || LIBELLE_STATUT.en_attente}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {d.client_nom ? `Client : ${d.client_nom}` : ""}
                      {d.projet_nom ? `· Projet : ${d.projet_nom}` : ""}·{" "}
                      {dater(d.cree_le)}
                    </p>
                  </div>
                </div>

                {d.demande && (
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                      Demande
                    </p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-2">
                      {d.demande}
                    </p>
                  </div>
                )}

                <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {d.modele && (
                    <span className="text-[10px] bg-i-blue/10 text-i-blue px-2 py-0.5 rounded-full">
                      IA · {d.modele}
                    </span>
                  )}
                  <button
                    onClick={() => setDevisDetail(d)}
                    className="ml-auto flex items-center gap-1 border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Voir le détail
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODALE DÉTAIL DEVIS */}
      {devisDetail && (
        <DevisModal
          devis={devisDetail}
          onClose={() => setDevisDetail(null)}
        />
      )}
    </div>
  );
}
