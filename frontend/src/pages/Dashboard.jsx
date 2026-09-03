// Dashboard.jsx — vue d'accueil interne (RF-16) avec données réelles
import { useEffect, useState } from "react";
import { projetsService } from "../api/projets";
import { useAuth } from "../auth/AuthContext";
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
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

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
  Filler
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
  vert: '#22c55e',
  orange: '#f59e0b',
  rouge: '#ef4444',
  bleu: '#3b82f6',
  violet: '#8b5cf6',
  rose: '#ec4899',
};

// === COMPOSANTS D'ICÔNES SVG ===

// Icône Tableau de bord
const DashboardIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);

// Icône Projets
const ProjetsIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

// Icône Tâches
const TachesIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// Icône Membres
const MembresIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
);

// Icône Assistant IA
const IAIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

// Icône Devis
const DevisIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h12m-12 2.25h12M3.375 4.5h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 01-1.125-1.125V5.625c0-.621.504-1.125 1.125-1.125z" />
  </svg>
);

// Icône Facturation
const FacturationIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
  </svg>
);

// Icône Chat
const ChatIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>
);

// Icône Documents
const DocumentsIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

// Icône Rafraîchir
const RefreshIcon = ({ className = "w-5 h-5", spinning = false }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`${className} ${spinning ? 'animate-spin' : ''}`}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

// Icône Statut Bon
const BonIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// Icône Statut Attention
const AttentionIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

// Icône Statut Critique
const CritiqueIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function Dashboard() {
  const { user } = useAuth();
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
        vert: projetsData.filter(p => p.statut_sante === "vert").length,
        orange: projetsData.filter(p => p.statut_sante === "orange").length,
        rouge: projetsData.filter(p => p.statut_sante === "rouge").length,
        avancementMoyen: projetsData.length > 0 
          ? Math.round(projetsData.reduce((acc, p) => acc + (p.avancement_pct || 0), 0) / projetsData.length)
          : 0,
        tachesTotales: projetsData.reduce((acc, p) => acc + (p.taches_total || 0), 0),
        tachesTerminees: projetsData.reduce((acc, p) => acc + (p.taches_terminees || 0), 0),
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
      setErreur(err.response?.data?.detail || "Erreur de chargement des données.");
    } finally {
      setLoading(false);
    }
  };

  const genererEvolution = (projets) => {
    const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const projetsParMois = mois.map(() => 0);
    const projetsTerminesParMois = mois.map(() => 0);

    projets.forEach(projet => {
      if (projet.date_debut) {
        const date = new Date(projet.date_debut);
        const moisIndex = date.getMonth();
        projetsParMois[moisIndex] = (projetsParMois[moisIndex] || 0) + 1;
      }
      if (projet.date_fin && projet.statut_sante === "vert" && projet.avancement_pct === 100) {
        const date = new Date(projet.date_fin);
        const moisIndex = date.getMonth();
        projetsTerminesParMois[moisIndex] = (projetsTerminesParMois[moisIndex] || 0) + 1;
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
          label: function(context) {
            return `Avancement : ${context.parsed.y}%`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: { 
          callback: (value) => value + '%',
          font: {
            size: window.innerWidth < 640 ? 8 : 10
          }
        }
      },
      x: {
        grid: { display: false },
        ticks: {
          font: {
            size: window.innerWidth < 640 ? 8 : 10
          },
          maxRotation: window.innerWidth < 640 ? 45 : 0,
          minRotation: window.innerWidth < 640 ? 45 : 0
        }
      }
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: window.innerWidth < 640 ? 'bottom' : 'right',
        labels: {
          padding: window.innerWidth < 640 ? 10 : 20,
          usePointStyle: true,
          pointStyle: 'circle',
          font: {
            size: window.innerWidth < 640 ? 10 : 12
          }
        },
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
            return `${context.label}: ${context.parsed} projet (${percentage}%)`;
          }
        }
      }
    },
    cutout: window.innerWidth < 640 ? '60%' : '70%',
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          font: {
            size: window.innerWidth < 640 ? 10 : 12
          }
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { 
          stepSize: 1,
          font: {
            size: window.innerWidth < 640 ? 8 : 10
          }
        },
      },
      x: {
        ticks: {
          font: {
            size: window.innerWidth < 640 ? 8 : 10
          },
          maxRotation: window.innerWidth < 640 ? 45 : 0
        }
      }
    },
  };

  const barChartData = {
    labels: projets.map(p => p.nom?.length > 15 ? p.nom.substring(0, 15) + '...' : p.nom || 'Sans nom'),
    datasets: [
      {
        label: 'Avancement (%)',
        data: projets.map(p => p.avancement_pct || 0),
        backgroundColor: projets.map(p => {
          if (p.statut_sante === 'vert') return CHART_COLORS.vert;
          if (p.statut_sante === 'orange') return CHART_COLORS.orange;
          return CHART_COLORS.rouge;
        }),
        borderColor: projets.map(p => {
          if (p.statut_sante === 'vert') return '#16a34a';
          if (p.statut_sante === 'orange') return '#d97706';
          return '#dc2626';
        }),
        borderWidth: 2,
        borderRadius: 4,
      },
    ],
  };

  const doughnutChartData = {
    labels: ['Bon', 'Attention', 'Critique'],
    datasets: [
      {
        data: [stats.vert, stats.orange, stats.rouge],
        backgroundColor: [
          CHART_COLORS.vert,
          CHART_COLORS.orange,
          CHART_COLORS.rouge,
        ],
        borderColor: ['#ffffff', '#ffffff', '#ffffff'],
        borderWidth: 3,
      },
    ],
  };

  const lineChartData = {
    labels: evolutionData.mois || ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'],
    datasets: [
      {
        label: 'Projets en cours',
        data: evolutionData.actifs || Array(12).fill(0),
        borderColor: CHART_COLORS.bleu,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: CHART_COLORS.bleu,
        pointRadius: window.innerWidth < 640 ? 2 : 4,
      },
      {
        label: 'Projets terminés',
        data: evolutionData.termines || Array(12).fill(0),
        borderColor: CHART_COLORS.vert,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
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
    <div className="animate__animated animate__fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
            Bonjour {user?.prenom || ''} {user?.nom || ''} !
          </h1>
          <p className="text-sm text-slate-500">
            Voici l'ensemble des projets.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="mt-2 sm:mt-0 flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#63B23E] text-white text-sm sm:text-base hover:bg-[#3F894E] transition-colors disabled:opacity-50"
        >
          <RefreshIcon spinning={loading} className="w-4 h-4" />
          {loading ? 'Chargement...' : 'Rafraîchir'}
        </button>
      </div>

      {/* Chargement */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">Chargement des données…</span>
        </div>
      )}

      {/* Erreur */}
      {erreur && (
        <div className="mb-4 bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span>⚠️ {erreur}</span>
            <button onClick={handleRefresh} className="text-red-600 hover:text-red-800 underline text-sm sm:text-base">
              Réessayer
            </button>
          </div>
        </div>
      )}

      {!loading && !erreur && (
        <>
          {/* Cartes statistiques avec icônes SVG */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6">
            <StatCard
              title="Total"
              value={stats.total}
              color="text-slate-900"
              icon={<DashboardIcon className="w-5 h-5 text-slate-600" />}
            />
            <StatCard
              title="Bon"
              value={stats.vert}
              color="text-green-600"
              icon={<BonIcon className="w-5 h-5 text-green-600" />}
            />
            <StatCard
              title="Attention"
              value={stats.orange}
              color="text-orange-600"
              icon={<AttentionIcon className="w-5 h-5 text-orange-600" />}
            />
            <StatCard
              title="Critique"
              value={stats.rouge}
              color="text-red-600"
              icon={<CritiqueIcon className="w-5 h-5 text-red-600" />}
            />
            <StatCard
              title="Moyenne"
              value={`${stats.avancementMoyen}%`}
              color="text-blue-600"
              icon={<TachesIcon className="w-5 h-5 text-blue-600" />}
            />
            <StatCard
              title="Tâches"
              value={`${stats.tachesTerminees}/${stats.tachesTotales}`}
              color="text-purple-600"
              icon={<TachesIcon className="w-5 h-5 text-purple-600" />}
            />
          </div>

          {/* Graphiques */}
          {projets.length > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {/* Graphique en barres */}
                <div className="bg-white border border-slate-200 p-3 sm:p-4 shadow-sm">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                    <ProjetsIcon className="w-4 h-4 text-slate-500" />
                    Avancement des projets
                  </h3>
                  <div className="h-48 sm:h-56 md:h-64">
                    <Bar data={barChartData} options={barOptions} />
                  </div>
                </div>

                {/* Graphique en donut */}
                <div className="bg-white border border-slate-200 p-3 sm:p-4 shadow-sm">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                    <DashboardIcon className="w-4 h-4 text-slate-500" />
                    Répartition des statuts
                  </h3>
                  <div className="h-48 sm:h-56 md:h-64 flex items-center justify-center">
                    <div className="w-40 sm:w-52 md:w-64 h-40 sm:h-52 md:h-64">
                      <Doughnut data={doughnutChartData} options={doughnutOptions} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Graphique linéaire */}
              <div className="bg-white border border-slate-200 p-3 sm:p-4 shadow-sm mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-slate-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1.5-1.5m0 0l-1.5 1.5m1.5-1.5V3.75m-7.5 0h16.5" />
                  </svg>
                  Évolution des projets
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
                    Liste des projets ({projets.length})
                  </h3>
                </div>
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {projets.map((p) => (
                    <ProjectCard key={p.id} projet={p} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 sm:py-12 bg-slate-50 border border-slate-200">
              <p className="text-slate-500">Aucun projet pour le moment.</p>
              <button className="mt-4 px-4 py-2 bg-[#63B23E] text-white hover:bg-[#3F894E] transition-colors">
                + Créer un projet
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Composant StatCard avec icône SVG
function StatCard({ title, value, color, icon }) {
  return (
    <div className="bg-white border border-slate-200 p-2 sm:p-3 md:p-4 shadow-sm">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-wider truncate">{title}</p>
          <p className={`text-sm sm:text-base md:text-xl font-bold truncate ${color}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

// Composant ProjectCard avec icônes SVG
function ProjectCard({ projet }) {
  const getStatutLabel = (statut) => {
    const labels = {
      vert: "Bon",
      orange: "Attention",
      rouge: "Critique",
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
      className="group border border-slate-200 bg-white p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer"
      onClick={() => window.location.href = `/projets/${projet.id}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="font-semibold text-slate-900 truncate text-xs sm:text-sm md:text-base">
          {projet.nom || 'Sans nom'}
        </h2>
        <span
          className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ${
            couleurStatut[projet.statut_sante] || "bg-slate-100 text-slate-700"
          }`}
        >
          <span className="text-[10px] sm:text-xs">{statutIcone[projet.statut_sante] || '⚪'}</span>
          <span className="hidden xs:inline">{getStatutLabel(projet.statut_sante)}</span>
        </span>
      </div>

      {projet.client && (
        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 mb-2 truncate">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {projet.client}
        </div>
      )}

      <div className="mb-1 h-1.5 w-full overflow-hidden bg-slate-100">
        <div
          className={`h-full transition-all duration-500 ${
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
          {projet.avancement_pct || 0}% terminé
        </p>
        <span className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {projet.taches_terminees || 0}/{projet.taches_total || 0}
        </span>
      </div>

      {projet.date_fin && (
        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-400 mt-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          {new Date(projet.date_fin).toLocaleDateString('fr-FR')}
        </div>
      )}
    </div>
  );
}