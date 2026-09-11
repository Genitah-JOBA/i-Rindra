// MonProjet.jsx — dashboard client : le client voit uniquement son projet (RF-19 à RF-22).
import { useEffect, useState } from "react";
import api from "../api/client";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import "animate.css";

ChartJS.register(ArcElement, Tooltip, Legend);

const COULEUR_STATUT = {
  vert: { badge: "bg-green-100 text-green-800", barre: "bg-[#22c55e]" },
  orange: { badge: "bg-orange-100 text-orange-800", barre: "bg-[#f59e0b]" },
  rouge: { badge: "bg-red-100 text-red-800", barre: "bg-[#ef4444]" },
};

const PRIORITE_STYLE = {
  basse: "bg-slate-100 text-slate-600",
  moyenne: "bg-blue-100 text-blue-700",
  haute: "bg-red-100 text-red-700",
};

const STATUT_STYLE = {
  a_faire: "bg-slate-100 text-slate-600",
  en_cours: "bg-blue-100 text-blue-700",
  en_revue: "bg-purple-100 text-purple-700",
  termine: "bg-green-100 text-green-800",
};

const ALERTE_STYLE = {
  haute: "border-l-red-400 bg-red-50",
  moyenne: "border-l-orange-400 bg-orange-50",
  basse: "border-l-yellow-400 bg-yellow-50",
};

const ALERTE_ICONE = {
  haute: "🔴",
  moyenne: "🟠",
  basse: "🟡",
};

const STATUT_MAP = { vert: "Bon", orange: "Attention", rouge: "Critique" };
const KANBAN_MAP = { a_faire: "À faire", en_cours: "En cours", en_revue: "En revue", termine: "Terminé" };
const PRIORITE_MAP = { basse: "Basse", moyenne: "Moyenne", haute: "Haute" };

export default function MonProjet() {
  const [projets, setProjets] = useState([]);
  const [projetId, setProjetId] = useState(null);
  const [projet, setProjet] = useState(null);
  const [avancement, setAvancement] = useState(null);
  const [taches, setTaches] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  const chargerProjets = async () => {
    try {
      const { data } = await api.get("/client/projets");
      setProjets(data || []);
      if (data?.length) {
        const actif = data[0];
        setProjetId(actif.id);
        await chargerDetailActif(actif.id);
      } else {
        setProjet(null);
        setAvancement(null);
        setTaches([]);
        setAlertes([]);
      }
    } catch (err) {
      setErreur(err.response?.data?.detail || "Aucun projet trouvé pour votre compte.");
    } finally {
      setLoading(false);
    }
  };

  const chargerDetailActif = async (id) => {
    const params = { projet_id: id };
    const [projetData, avancementData, tachesData, alertesData] =
      await Promise.all([
        api.get("/client/mon-projet", { params }),
        api.get("/client/mon-projet/avancement", { params }),
        api.get("/client/mon-projet/taches", { params }),
        api.get("/dashboard/alertes"),
      ]);
    setProjet(projetData.data);
    setAvancement(avancementData.data);
    setTaches(tachesData.data || []);
    setAlertes(alertesData.data || []);
  };

  const chargerDonnees = async () => {
    setLoading(true);
    setErreur("");
    try {
      await chargerProjets();
    } catch (err) {
      setErreur(err.response?.data?.detail || "Aucun projet trouvé pour votre compte.");
    } finally {
      setLoading(false);
    }
  };

  const choisirProjet = async (id) => {
    setProjetId(id);
    try {
      await chargerDetailActif(id);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Aucun projet trouvé pour votre compte.");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerDonnees();
  }, []);

  const estTermine = (projet?.avancement_pct || 0) >= 100;
  const enRetard = projet?.date_fin_prevue
    ? new Date(projet.date_fin_prevue) < new Date() && !estTermine
    : false;

  let joursEcheance = null;
  if (projet?.date_fin_prevue) {
    const diff = Math.ceil(
      (new Date(projet.date_fin_prevue) - new Date()) / (1000 * 60 * 60 * 24),
    );
    joursEcheance = diff;
  }

  const details = avancement?.details || {
    a_faire: 0,
    en_cours: 0,
    en_revue: 0,
    termine: 0,
  };
  const totalTaches = avancement?.total_taches || 0;

  const doughnutData = {
    labels: [
      "À faire",
      "En cours",
      "En revue",
      "Terminé",
    ],
    datasets: [
      {
        data: [
          details.a_faire,
          details.en_cours,
          details.en_revue,
          details.termine,
        ],
        backgroundColor: ["#94a3b8", "#3b82f6", "#8b5cf6", "#22c55e"],
        borderColor: "#ffffff",
        borderWidth: 3,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { usePointStyle: true, pointStyle: "circle", padding: 14 },
      },
    },
    cutout: "62%",
  };

  const fmtDate = (dateStr) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString(
          navigator.language?.startsWith("en") ? "en-GB" : "fr-FR",
        )
      : "—";

  const fmtPriorite = (p) => PRIORITE_MAP[p] || p;

  if (loading)
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
        <span className="ml-3 text-slate-500">{"Chargement…"}</span>
      </div>
    );

  if (erreur)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {erreur}
      </div>
    );

  const couleurStatut = COULEUR_STATUT[projet?.statut_sante] || {
    badge: "bg-slate-100 text-slate-700",
    barre: "bg-slate-400",
  };

  return (
    <div className="animate__animated animate__fadeIn w-full">
      {/* En-tête */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              {projet.nom}
            </h1>
            <p className="text-sm text-slate-500">{"Voici l'avancement de votre projet."}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs sm:text-sm font-medium ${couleurStatut.badge}`}
            >
              {STATUT_MAP[projet.statut_sante] || projet.statut_sante}
            </span>
            <button
              onClick={chargerDonnees}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-[#63B23E] text-white hover:bg-[#3F894E] transition-colors disabled:opacity-50"
            >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            {"Rafraîchir"}
          </button>
        </div>
      </div>

      {/* Sélecteur de projets */}
      {projets.length > 1 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {"Mes projets"}
          </p>
          <div className="flex flex-wrap gap-2">
            {projets.map((p) => {
              const actif = p.id === projetId;
              return (
                <button
                  key={p.id}
                  onClick={() => choisirProjet(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border transition-colors ${
                    actif
                      ? "bg-[#63B23E] border-[#63B23E] text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-700 hover:border-[#63B23E] hover:text-[#3F894E]"
                  }`}
                >
                  <span className={actif ? "" : "text-slate-400"}>
                    {STATUT_MAP[p.statut_sante] || p.statut_sante}
                  </span>
                  <span className="max-w-[200px] truncate">{p.nom}</span>
                  <span
                    className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                      actif
                        ? "bg-white/20 text-white"
                        : p.avancement_pct >= 100
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.avancement_pct || 0}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {/* Cartes indicateurs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-white border border-slate-200 p-4 shadow-sm hover:border-[#63B23E] transition-colors">
          <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider">
            {"Avancement"}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-[#63B23E]">
            {projet.avancement_pct || 0}%
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm hover:border-[#63B23E] transition-colors">
          <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider">
            {"Tâches"}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900">
            {totalTaches}
          </p>
          <p className="text-[10px] text-slate-400">
            {details.termine} {"Terminées"}
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm hover:border-[#63B23E] transition-colors">
          <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider">
            {estTermine ? "Terminées" : "Restantes"}
          </p>
          <p
            className={`text-xl sm:text-2xl font-bold ${
              enRetard ? "text-red-600" : "text-slate-900"
            }`}
          >
            {estTermine ? "100% ✓" : `${totalTaches - details.termine}`}
          </p>
          <p className="text-[10px] text-slate-400">
            {STATUT_MAP[projet.statut_sante] || projet.statut_sante}
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm hover:border-[#63B23E] transition-colors">
          <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider">
            {enRetard ? "En retard" : "Statut"}
          </p>
          <p
            className={`text-xl sm:text-2xl font-bold truncate ${
              enRetard ? "text-red-600" : "text-slate-900"
            }`}
          >
            {projet.date_fin_prevue ? fmtDate(projet.date_fin_prevue) : "—"}
          </p>
          <p className="text-[10px] text-slate-400">
            {joursEcheance !== null
              ? enRetard
                ? `${Math.abs(joursEcheance)} ${"jours de retard"}`
                : `${joursEcheance} ${"jours restants"}`
              : "Fin prévue"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        {/* Avancement détaillé */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            {projet.description || "Rapport d'activité"}
          </h3>

          {/* Barre de progression */}
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>
              {projet.avancement_pct || 0}%{" "}
              {estTermine ? "✓" : "terminé"}
            </span>
            <span>
              {fmtDate(projet.date_debut)} → {fmtDate(projet.date_fin_prevue)}
            </span>
          </div>
          <div className="mb-6 h-3 w-full overflow-hidden rounded bg-slate-100">
            <div
              className={`h-full rounded transition-all duration-700 ${couleurStatut.barre}`}
              style={{ width: `${Math.min(projet.avancement_pct || 0, 100)}%` }}
            />
          </div>

          {/* Répartition par statut */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              ["a_faire", details.a_faire, "#94a3b8"],
              ["en_cours", details.en_cours, "#3b82f6"],
              ["en_revue", details.en_revue, "#8b5cf6"],
              ["termine", details.termine, "#22c55e"],
            ].map(([cle, valeur, couleur]) => (
              <div
                key={cle}
                className="rounded border border-slate-200 p-3 text-center"
              >
                <p className="text-lg font-bold" style={{ color: couleur }}>
                  {valeur}
                </p>
                <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider">
                  {KANBAN_MAP[cle]}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Graphique répartition */}
        <div className="bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            {"Répartition des tâches"}
          </h3>
          <div className="h-56 flex items-center justify-center">
            {totalTaches > 0 ? (
              <div className="w-full max-w-[240px]">
                <Doughnut data={doughnutData} options={doughnutOptions} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">{"Aucune tâche pour le moment."}</p>
            )}
          </div>
        </div>
      </div>

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            {"Alertes"} ({alertes.length})
          </h3>
          <div className="space-y-2">
            {alertes.map((alerte, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 border-l-4 px-3 py-2 text-sm ${ALERTE_STYLE[alerte.priorite]}`}
              >
                <span>{ALERTE_ICONE[alerte.priorite]}</span>
                <div>
                  <p className="text-slate-700">{alerte.message}</p>
                  <p className="text-[10px] text-slate-400">
                    {fmtDate(alerte.date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {alertes.length === 0 && (
        <div className="mb-6 rounded border-l-4 border-l-green-500 bg-green-50 px-3 py-2 text-sm text-green-700">
          ✓ {"Aucune alerte. Tout va bien."}
        </div>
      )}

      {/* Liste des tâches */}
      <div className="bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            {"Tâches"} ({taches.length})
          </h3>
        </div>
        {taches.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            {"Aucune tâche pour le moment."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {taches.map((tache) => (
              <div
                key={tache.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {tache.titre}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] sm:text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${STATUT_STYLE[tache.statut]}`}
                    >
                      {KANBAN_MAP[tache.statut]}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${PRIORITE_STYLE[tache.priorite]}`}
                    >
                      {fmtPriorite(tache.priorite)}
                    </span>
                  </div>
                </div>
                {tache.echeance && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
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
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                    <span>
                      {"Échéance"}: {fmtDate(tache.echeance)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
