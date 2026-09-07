// Dashboard.jsx — vue d'accueil interne (RF-16) avec données réelles et animations
import { useEffect, useState } from "react";
import { projetsService } from "../api/projets";
import { useAuth } from "../auth/AuthContext";
import { useLang } from "../i18n/LangContext";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import 'animate.css';

// Enregistrer les composants Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
);

// Couleurs des statuts
const couleurStatut = {
  vert: "bg-green-100 text-green-800",
  orange: "bg-orange-100 text-orange-800",
  rouge: "bg-red-100 text-red-800",
};

const statutIcone = {
  vert: "🟢",
  orange: "🟠",
  rouge: "🔴",
};

// Couleurs pour les graphiques
const CHART_COLORS = {
  vert: "#22c55e",
  orange: "#f59e0b",
  rouge: "#ef4444",
  bleu: "#3b82f6",
  violet: "#8b5cf6",
  rose: "#ec4899",
};

// === COMPOSANTS D'ICÔNES SVG ===

// Icône Tableau de bord
const DashboardIcon = ({ className = "w-5 h-5" }) => (
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
      d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
    />
  </svg>
);

// Icône Projets
const ProjetsIcon = ({ className = "w-5 h-5" }) => (
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
      d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
    />
  </svg>
);

// Icône Tâches
const TachesIcon = ({ className = "w-5 h-5" }) => (
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
      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

// Icône Rafraîchir
const RefreshIcon = ({ className = "w-5 h-5", spinning = false }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className={`${className} ${spinning ? "animate-spin" : ""}`}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);

// Icône Statut Bon
const BonIcon = ({ className = "w-5 h-5" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

// Icône Statut Attention
const AttentionIcon = ({ className = "w-5 h-5" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
    />
  </svg>
);

// Icône Statut Critique
const CritiqueIcon = ({ className = "w-5 h-5" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const MOIS =
    lang === "en"
      ? [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ]
      : [
          "Jan",
          "Fév",
          "Mar",
          "Avr",
          "Mai",
          "Juin",
          "Juil",
          "Aoû",
          "Sep",
          "Oct",
          "Nov",
          "Déc",
        ];
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    vert: 0,
    orange: 0,
    rouge: 0,
    avancementMoyen: 0,
    tachesTotales: 0,
    tachesTerminees: 0,
  });
  const [evolutionData, setEvolutionData] = useState([]);

  useEffect(() => {
    chargerDonnees();
  }, []);

  const chargerDonnees = async () => {
    setLoading(true);
    try {
      const projetsData = await projetsService.list();
      setProjets(projetsData);

      const statsCalc = {
        total: projetsData.length,
        vert: projetsData.filter((p) => p.statut_sante === "vert").length,
        orange: projetsData.filter((p) => p.statut_sante === "orange").length,
        rouge: projetsData.filter((p) => p.statut_sante === "rouge").length,
        avancementMoyen:
          projetsData.length > 0
            ? Math.round(
                projetsData.reduce(
                  (acc, p) => acc + (p.avancement_pct || 0),
                  0,
                ) / projetsData.length,
              )
            : 0,
        tachesTotales: projetsData.reduce(
          (acc, p) => acc + (p.taches_total || 0),
          0,
        ),
        tachesTerminees: projetsData.reduce(
          (acc, p) => acc + (p.taches_terminees || 0),
          0,
        ),
      };
      setStats(statsCalc);

      try {
        const evolution = await projetsService.getEvolution();
        setEvolutionData(evolution);
      } catch (err) {
        const evoGenerees = genererEvolution(projetsData);
        setEvolutionData(evoGenerees);
      }
    } catch (err) {
      setErreur(
        err.response?.data?.detail || "Erreur de chargement des données.",
      );
    } finally {
      setLoading(false);
    }
  };

  const genererEvolution = (projets) => {
    const mois = MOIS;
    const projetsParMois = mois.map(() => 0);
    const projetsTerminesParMois = mois.map(() => 0);

    projets.forEach((projet) => {
      if (projet.date_debut) {
        const date = new Date(projet.date_debut);
        const moisIndex = date.getMonth();
        projetsParMois[moisIndex] = (projetsParMois[moisIndex] || 0) + 1;
      }
      if (
        projet.date_fin &&
        projet.statut_sante === "vert" &&
        projet.avancement_pct === 100
      ) {
        const date = new Date(projet.date_fin);
        const moisIndex = date.getMonth();
        projetsTerminesParMois[moisIndex] =
          (projetsTerminesParMois[moisIndex] || 0) + 1;
      }
    });

    let cumulActifs = 0;
    let cumulTermines = 0;
    const actifsCumules = mois.map((_, i) => {
      cumulActifs += projetsParMois[i] || 0;
      return cumulActifs;
    });
    const terminesCumules = mois.map((_, i) => {
      cumulTermines += projetsTerminesParMois[i] || 0;
      return cumulTermines;
    });

    return { mois, actifs: actifsCumules, termines: terminesCumules };
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `Avancement : ${context.parsed.y}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value) => value + "%",
          font: {
            size: window.innerWidth < 640 ? 8 : 10,
          },
        },
      },
      x: {
        grid: { display: false },
        ticks: {
          font: {
            size: window.innerWidth < 640 ? 8 : 10,
          },
          maxRotation: window.innerWidth < 640 ? 45 : 0,
          minRotation: window.innerWidth < 640 ? 45 : 0,
        },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: window.innerWidth < 640 ? "bottom" : "right",
        labels: {
          padding: window.innerWidth < 640 ? 10 : 20,
          usePointStyle: true,
          pointStyle: "circle",
          font: {
            size: window.innerWidth < 640 ? 10 : 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage =
              total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
            return `${context.label}: ${context.parsed} projet (${percentage}%)`;
          },
        },
      },
    },
    cutout: window.innerWidth < 640 ? "60%" : "70%",
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          font: {
            size: window.innerWidth < 640 ? 10 : 12,
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: {
            size: window.innerWidth < 640 ? 8 : 10,
          },
        },
      },
      x: {
        ticks: {
          font: {
            size: window.innerWidth < 640 ? 8 : 10,
          },
          maxRotation: window.innerWidth < 640 ? 45 : 0,
        },
      },
    },
  };

  const barChartData = {
    labels: projets.map((p) =>
      p.nom?.length > 15 ? p.nom.substring(0, 15) + "..." : p.nom || "Sans nom",
    ),
    datasets: [
      {
        label: "Avancement (%)",
        data: projets.map((p) => p.avancement_pct || 0),
        backgroundColor: projets.map((p) => {
          if (p.statut_sante === "vert") return CHART_COLORS.vert;
          if (p.statut_sante === "orange") return CHART_COLORS.orange;
          return CHART_COLORS.rouge;
        }),
        borderColor: projets.map((p) => {
          if (p.statut_sante === "vert") return "#16a34a";
          if (p.statut_sante === "orange") return "#d97706";
          return "#dc2626";
        }),
        borderWidth: 2,
        borderRadius: 4,
      },
    ],
  };

  const doughnutChartData = {
    labels: [t("statut.vert"), t("statut.orange"), t("statut.rouge")],
    datasets: [
      {
        data: [stats.vert, stats.orange, stats.rouge],
        backgroundColor: [
          CHART_COLORS.vert,
          CHART_COLORS.orange,
          CHART_COLORS.rouge,
        ],
        borderColor: ["#ffffff", "#ffffff", "#ffffff"],
        borderWidth: 3,
      },
    ],
  };

  const lineChartData = {
    labels: evolutionData.mois || MOIS,
    datasets: [
      {
        label: t("dash.chart.enCours"),
        data: evolutionData.actifs || Array(12).fill(0),
        borderColor: CHART_COLORS.bleu,
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.4,
        pointBackgroundColor: CHART_COLORS.bleu,
        pointRadius: window.innerWidth < 640 ? 2 : 4,
      },
      {
        label: t("dash.chart.termines"),
        data: evolutionData.termines || Array(12).fill(0),
        borderColor: CHART_COLORS.vert,
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        fill: true,
        tension: 0.4,
        pointBackgroundColor: CHART_COLORS.vert,
        pointRadius: window.innerWidth < 640 ? 2 : 4,
      },
    ],
  };

  const getStatutLabel = (statut) => {
    const labels = {
      vert: "Bon",
      orange: "Attention",
      rouge: "Critique",
    };
    return labels[statut] || statut;
  };

  const handleRefresh = () => {
    chargerDonnees();
  };

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête avec animation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 animate__animated animate__fadeInDown">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
            {t("dash.bonjour")} {user?.prenom || ""} {user?.nom || ""} !
          </h1>
          <p className="text-sm text-slate-500">{t("dash.sousTitre")}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="mt-2 sm:mt-0 flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#63B23E] text-white text-sm sm:text-base  hover:bg-[#3F894E] transition-colors disabled:opacity-50"
        >
          <RefreshIcon spinning={loading} className="w-4 h-4" />
          {loading ? t("common.chargement") : t("dash.refresh")}
        </button>
      </div>

      {/* Chargement avec animation */}
      {loading && (
        <div className="flex justify-center items-center py-12 animate__animated animate__pulse">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">{t("common.chargement")}</span>
        </div>
      )}

      {/* Erreur */}
      {erreur && (
        <div className="mb-4  bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 animate__animated animate__shakeX">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span>⚠️ {erreur}</span>
            <button
              onClick={handleRefresh}
              className="text-red-600 hover:text-red-800 underline text-sm sm:text-base"
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {!loading && !erreur && (
        <>
          {/* Cartes statistiques avec animation */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6">
            <div className="animate__animated animate__fadeInUp" style={{ animationDelay: '0.05s' }}>
              <StatCard
                title={t("dash.total")}
                value={stats.total}
                color="text-slate-900"
                icon={<DashboardIcon className="w-5 h-5 text-slate-600" />}
              />
            </div>
            <div className="animate__animated animate__fadeInUp" style={{ animationDelay: '0.10s' }}>
              <StatCard
                title={t("statut.vert")}
                value={stats.vert}
                color="text-green-600"
                icon={<BonIcon className="w-5 h-5 text-green-600" />}
              />
            </div>
            <div className="animate__animated animate__fadeInUp" style={{ animationDelay: '0.15s' }}>
              <StatCard
                title={t("statut.orange")}
                value={stats.orange}
                color="text-orange-600"
                icon={<AttentionIcon className="w-5 h-5 text-orange-600" />}
              />
            </div>
            <div className="animate__animated animate__fadeInUp" style={{ animationDelay: '0.20s' }}>
              <StatCard
                title={t("statut.rouge")}
                value={stats.rouge}
                color="text-red-600"
                icon={<CritiqueIcon className="w-5 h-5 text-red-600" />}
              />
            </div>
            <div className="animate__animated animate__fadeInUp" style={{ animationDelay: '0.25s' }}>
              <StatCard
                title={t("dash.moyenne")}
                value={`${stats.avancementMoyen}%`}
                color="text-blue-600"
                icon={<TachesIcon className="w-5 h-5 text-blue-600" />}
              />
            </div>
            <div className="animate__animated animate__fadeInUp" style={{ animationDelay: '0.30s' }}>
              <StatCard
                title={t("dash.taches")}
                value={`${stats.tachesTerminees}/${stats.tachesTotales}`}
                color="text-purple-600"
                icon={<TachesIcon className="w-5 h-5 text-purple-600" />}
              />
            </div>
          </div>

          {/* Graphiques avec animation */}
          {projets.length > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {/* Graphique en barres */}
                <div className="bg-white border border-slate-200 p-3 sm:p-4 shadow-sm  animate__animated animate__fadeInUp" style={{ animationDelay: '0.10s' }}>
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                    <ProjetsIcon className="w-4 h-4 text-slate-500" />
                    {t("dash.chart.avancement")}
                  </h3>
                  <div className="h-48 sm:h-56 md:h-64">
                    <Bar data={barChartData} options={barOptions} />
                  </div>
                </div>

                {/* Graphique en donut */}
                <div className="bg-white border border-slate-200 p-3 sm:p-4 shadow-sm  animate__animated animate__fadeInUp" style={{ animationDelay: '0.20s' }}>
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                    <DashboardIcon className="w-4 h-4 text-slate-500" />
                    {t("dash.chart.repartition")}
                  </h3>
                  <div className="h-48 sm:h-56 md:h-64 flex items-center justify-center">
                    <div className="w-40 sm:w-52 md:w-64 h-40 sm:h-52 md:h-64">
                      <Doughnut
                        data={doughnutChartData}
                        options={doughnutOptions}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Graphique linéaire */}
              <div className="bg-white border border-slate-200 p-3 sm:p-4 shadow-sm  mb-4 sm:mb-6 animate__animated animate__fadeInUp" style={{ animationDelay: '0.30s' }}>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-4 h-4 text-slate-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1.5-1.5m0 0l-1.5 1.5m1.5-1.5V3.75m-7.5 0h16.5"
                    />
                  </svg>
                  {t("dash.chart.evolution")}
                </h3>
                <div className="h-48 sm:h-56 md:h-64">
                  <Line data={lineChartData} options={lineOptions} />
                </div>
              </div>

              {/* Liste des projets */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <ProjetsIcon className="w-4 h-4 text-slate-500" />
                    {t("dash.liste")} ({projets.length})
                  </h3>
                </div>
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {projets.map((p, index) => (
                    <div 
                      key={p.id} 
                      className="animate__animated animate__fadeInUp" 
                      style={{ animationDelay: `${0.05 + (index * 0.05)}s` }}
                    >
                      <ProjectCard projet={p} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 sm:py-12 bg-slate-50 border border-slate-200  animate__animated animate__fadeInUp">
              <p className="text-slate-500">{t("dash.aucun")}</p>
              <button className="mt-4 px-4 py-2 bg-[#63B23E] text-white  hover:bg-[#3F894E] transition-colors">
                + Créer un projet
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Composant StatCard avec icône SVG et animation au survol
function StatCard({ title, value, color, icon }) {
  return (
    <div className="bg-white border border-slate-200 p-2 sm:p-3 md:p-4 shadow-sm  hover:shadow-md transition-all duration-300 hover:border-[#63B23E] hover:scale-105">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-wider truncate">
            {title}
          </p>
          <p
            className={`text-sm sm:text-base md:text-xl font-bold truncate ${color}`}
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

// Composant ProjectCard avec icônes SVG
function ProjectCard({ projet }) {
  const { t } = useLang();
  const getStatutLabel = (statut) => {
    const labels = {
      vert: t("statut.vert"),
      orange: t("statut.orange"),
      rouge: t("statut.rouge"),
    };
    return labels[statut] || statut;
  };

  const couleurStatut = {
    vert: "bg-green-100 text-green-800",
    orange: "bg-orange-100 text-orange-800",
    rouge: "bg-red-100 text-red-800",
  };

  const statutIcone = {
    vert: "🟢",
    orange: "🟠",
    rouge: "🔴",
  };

  return (
    <div
      className="group border border-slate-200 bg-white p-3 sm:p-4 shadow-sm hover:shadow-md hover:border-[#63B23E] transition-all duration-300  cursor-pointer hover:-translate-y-1"
      onClick={() => (window.location.href = `/projets/${projet.id}`)}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900 truncate text-xs sm:text-sm md:text-base">
          {projet.nom || "Sans nom"}
        </h2>
        <span
          className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0 rounded-full ${
            couleurStatut[projet.statut_sante] || "bg-slate-100 text-slate-700"
          }`}
        >
          <span className="text-[10px] sm:text-xs">
            {statutIcone[projet.statut_sante] || "⚪"}
          </span>
          <span className="hidden xs:inline">
            {getStatutLabel(projet.statut_sante)}
          </span>
        </span>
      </div>

      {projet.client && (
        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 mb-2 truncate">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-3 h-3 flex-shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
          {projet.client}
        </div>
      )}

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
        <p className="text-[10px] sm:text-xs text-slate-500">
          {projet.avancement_pct || 0}% {t("dash.termine")}
        </p>
        <span className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-3 h-3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {projet.taches_terminees || 0}/{projet.taches_total || 0}
        </span>
      </div>

      {projet.date_fin && (
        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-400 mt-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-3 h-3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          {new Date(projet.date_fin).toLocaleDateString("fr-FR")}
        </div>
      )}
    </div>
  );
}