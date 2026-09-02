// src/pages/Taches/index.jsx
import { useState, useEffect } from "react";
import { tachesService } from "../../api/taches";
import { projetsService } from "../../api/projets";
import { utilisateursService } from "../../api/utilisateurs";
import { useAuth } from "../../auth/AuthContext";
import 'animate.css';

// Icônes SVG (conservées)
const PlusIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

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

const ChevronDownIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
);

const KanbanIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);

const ListIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

// Couleurs des statuts
const couleurStatut = {
  a_faire: "bg-slate-100 text-slate-700",
  en_cours: "bg-blue-100 text-blue-700",
  terminee: "bg-green-100 text-green-700",
};

const labelStatut = {
  a_faire: "À faire",
  en_cours: "En cours",
  terminee: "Terminée",
};

const couleurPriorite = {
  basse: "bg-slate-100 text-slate-600",
  moyenne: "bg-yellow-100 text-yellow-700",
  haute: "bg-orange-100 text-orange-700",
  critique: "bg-red-100 text-red-700",
};

const labelPriorite = {
  basse: "Basse",
  moyenne: "Moyenne",
  haute: "Haute",
  critique: "Critique",
};

// DONNÉES MOCKÉES POUR TEST
const MOCK_TACHES = [
  {
    id: 1,
    projet_id: 2,
    titre: "Tache test",
    description: "x",
    statut: "a_faire",
    priorite: "moyenne",
    echeance: null,
    responsable_id: null,
    ordre: 1,
    projet: { id: 2, nom: "Projet Test" },
    responsable: null,
  },
  {
    id: 2,
    projet_id: 1,
    titre: "Créer la page d'accueil",
    description: "Développer la page d'accueil avec React",
    statut: "en_cours",
    priorite: "haute",
    echeance: "2026-09-15",
    responsable_id: 1,
    ordre: 2,
    projet: { id: 1, nom: "Site Web Kanto" },
    responsable: { id: 1, prenom: "Jean", nom: "Dupont" },
  },
  {
    id: 3,
    projet_id: 1,
    titre: "Configurer le routage",
    description: "Mettre en place React Router",
    statut: "a_faire",
    priorite: "moyenne",
    echeance: "2026-09-20",
    responsable_id: 2,
    ordre: 3,
    projet: { id: 1, nom: "Site Web Kanto" },
    responsable: { id: 2, prenom: "Marie", nom: "Martin" },
  },
  {
    id: 4,
    projet_id: 2,
    titre: "Tests unitaires",
    description: "Écrire les tests pour les composants",
    statut: "terminee",
    priorite: "basse",
    echeance: "2026-08-30",
    responsable_id: null,
    ordre: 4,
    projet: { id: 2, nom: "Projet Test" },
    responsable: null,
  },
];

const MOCK_PROJETS = [
  { id: 1, nom: "Site Web Kanto" },
  { id: 2, nom: "Projet Test" },
];

const MOCK_UTILISATEURS = [
  { id: 1, prenom: "Jean", nom: "Dupont", role: "direction" },
  { id: 2, prenom: "Marie", nom: "Martin", role: "equipe" },
];

export default function Taches() {
  const { user } = useAuth();
  const [taches, setTaches] = useState([]);
  const [projets, setProjets] = useState([]);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [vue, setVue] = useState("kanban");
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [filtrePriorite, setFiltrePriorite] = useState("tous");
  const [filtreProjet, setFiltreProjet] = useState("tous");
  const [recherche, setRecherche] = useState("");
  const [rechercheLocale, setRechercheLocale] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [formData, setFormData] = useState({
    projet_id: "",
    titre: "",
    description: "",
    statut: "a_faire",
    priorite: "moyenne",
    echeance: "",
    responsable_id: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formErreur, setFormErreur] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    a_faire: 0,
    en_cours: 0,
    terminee: 0,
  });

  useEffect(() => {
    chargerDonnees();
  }, []);

  const chargerDonnees = async () => {
    setLoading(true);
    setErreur("");
    try {
      // Essayer de charger depuis l'API
      let tachesData = [];
      let projetsData = [];
      let utilisateursData = [];
      let apiOk = false;

      try {
        const [tachesResponse, projetsResponse, utilisateursResponse] = await Promise.all([
          tachesService.list().catch(() => null),
          projetsService.list().catch(() => null),
          utilisateursService.list().catch(() => null),
        ]);

        if (tachesResponse) {
          tachesData = tachesResponse;
          apiOk = true;
        }
        if (projetsResponse) {
          projetsData = projetsResponse;
        }
        if (utilisateursResponse) {
          utilisateursData = utilisateursResponse;
        }
      } catch (apiError) {
        console.log("Erreur API, utilisation des données mockées:", apiError);
      }

      // Si l'API n'a pas renvoyé de données, utiliser les mockées
      if (!apiOk || tachesData.length === 0) {
        console.log("Utilisation des données mockées pour les tâches");
        tachesData = MOCK_TACHES;
        projetsData = MOCK_PROJETS;
        utilisateursData = MOCK_UTILISATEURS;
        setErreur("ℹ️ Données de démonstration (API non disponible)");
      }

      setTaches(tachesData);
      setProjets(projetsData);
      setUtilisateurs(utilisateursData);
      calculerStats(tachesData);
    } catch (err) {
      setErreur("Erreur de chargement des données.");
      // Utiliser les données mockées en cas d'erreur
      setTaches(MOCK_TACHES);
      setProjets(MOCK_PROJETS);
      setUtilisateurs(MOCK_UTILISATEURS);
      calculerStats(MOCK_TACHES);
    } finally {
      setLoading(false);
    }
  };

  const calculerStats = (data) => {
    const total = data.length;
    const a_faire = data.filter(t => t.statut === "a_faire").length;
    const en_cours = data.filter(t => t.statut === "en_cours").length;
    const terminee = data.filter(t => t.statut === "terminee").length;
    setStats({ total, a_faire, en_cours, terminee });
  };

  // Filtrage des tâches
  const tachesFiltres = taches.filter(tache => {
    if (filtreStatut !== "tous" && tache.statut !== filtreStatut) return false;
    if (filtrePriorite !== "tous" && tache.priorite !== filtrePriorite) return false;
    if (filtreProjet !== "tous" && tache.projet_id !== parseInt(filtreProjet)) return false;

    if (recherche) {
      const search = recherche.toLowerCase();
      const titre = tache.titre?.toLowerCase() || "";
      const description = tache.description?.toLowerCase() || "";
      if (!titre.includes(search) && !description.includes(search)) return false;
    }

    return true;
  });

  // Regrouper les tâches par statut pour la vue Kanban
  const tachesParStatut = {
    a_faire: tachesFiltres.filter(t => t.statut === "a_faire"),
    en_cours: tachesFiltres.filter(t => t.statut === "en_cours"),
    terminee: tachesFiltres.filter(t => t.statut === "terminee"),
  };

  const handleRechercheSubmit = (e) => {
    e.preventDefault();
    setRecherche(rechercheLocale);
  };

  const handleRechercheClear = () => {
    setRechercheLocale("");
    setRecherche("");
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormErreur("");

    if (!formData.titre.trim()) {
      setFormErreur("Le titre de la tâche est requis.");
      setFormLoading(false);
      return;
    }
    if (!formData.projet_id) {
      setFormErreur("Veuillez sélectionner un projet.");
      setFormLoading(false);
      return;
    }

    try {
      const nouvelleTache = await tachesService.create({
        projet_id: parseInt(formData.projet_id),
        titre: formData.titre,
        description: formData.description || null,
        statut: formData.statut,
        priorite: formData.priorite,
        echeance: formData.echeance || null,
        responsable_id: formData.responsable_id ? parseInt(formData.responsable_id) : null,
      });
      
      const projetTrouve = projets.find(p => p.id === parseInt(formData.projet_id));
      if (projetTrouve) {
        nouvelleTache.projet = projetTrouve;
      }
      
      if (formData.responsable_id) {
        const responsableTrouve = utilisateurs.find(u => u.id === parseInt(formData.responsable_id));
        if (responsableTrouve) {
          nouvelleTache.responsable = responsableTrouve;
        }
      }
      
      setTaches([nouvelleTache, ...taches]);
      calculerStats([nouvelleTache, ...taches]);
      setModalOuvert(false);
      setFormData({
        projet_id: "",
        titre: "",
        description: "",
        statut: "a_faire",
        priorite: "moyenne",
        echeance: "",
        responsable_id: "",
      });
    } catch (err) {
      setFormErreur(err.response?.data?.detail || "Erreur lors de la création de la tâche.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleStatutChange = async (tacheId, nouveauStatut) => {
    try {
      const tache = taches.find(t => t.id === tacheId);
      if (!tache) return;
      
      const updatedTache = await tachesService.update(tacheId, {
        ...tache,
        statut: nouveauStatut,
      });
      
      setTaches(taches.map(t => t.id === tacheId ? { ...updatedTache, projet: t.projet, responsable: t.responsable } : t));
      calculerStats(taches.map(t => t.id === tacheId ? { ...updatedTache, projet: t.projet, responsable: t.responsable } : t));
    } catch (err) {
      alert("Erreur lors du changement de statut.");
    }
  };

  const handleDeleteTache = async (tacheId) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette tâche ?")) return;
    
    try {
      await tachesService.delete(tacheId);
      const nouvellesTaches = taches.filter(t => t.id !== tacheId);
      setTaches(nouvellesTaches);
      calculerStats(nouvellesTaches);
    } catch (err) {
      alert("Erreur lors de la suppression de la tâche.");
    }
  };

  const statuts = [
    { id: "tous", label: "Tous", color: "bg-slate-100 text-slate-700" },
    { id: "a_faire", label: "À faire", color: "bg-slate-100 text-slate-700" },
    { id: "en_cours", label: "En cours", color: "bg-blue-100 text-blue-700" },
    { id: "terminee", label: "Terminée", color: "bg-green-100 text-green-700" },
  ];

  const priorites = [
    { id: "tous", label: "Toutes" },
    { id: "basse", label: "Basse" },
    { id: "moyenne", label: "Moyenne" },
    { id: "haute", label: "Haute" },
    { id: "critique", label: "Critique" },
  ];

  const statutOptions = [
    { id: "a_faire", label: "À faire" },
    { id: "en_cours", label: "En cours" },
    { id: "terminee", label: "Terminée" },
  ];

  const prioriteOptions = [
    { id: "basse", label: "Basse" },
    { id: "moyenne", label: "Moyenne" },
    { id: "haute", label: "Haute" },
    { id: "critique", label: "Critique" },
  ];

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
            Tâches
          </h1>
          <p className="text-sm text-slate-500">
            Gérez toutes les tâches de vos projets.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            onClick={() => setVue("kanban")}
            className={`p-2 transition-colors ${
              vue === "kanban" 
                ? "bg-[#63B23E] text-white" 
                : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
            }`}
            title="Vue Kanban"
          >
            <KanbanIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setVue("liste")}
            className={`p-2 transition-colors ${
              vue === "liste" 
                ? "bg-[#63B23E] text-white" 
                : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
            }`}
            title="Vue Liste"
          >
            <ListIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setModalOuvert(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#63B23E] text-white text-sm hover:bg-[#3F894E] transition-colors ml-2"
          >
            <PlusIcon className="w-4 h-4" />
            Nouvelle tâche
          </button>
        </div>
      </div>

      {/* Message d'erreur/information */}
      {erreur && (
        <div className={`mb-4 px-4 py-3 text-sm border ${
          erreur.includes("démonstration") 
            ? "bg-amber-50 text-amber-700 border-amber-200" 
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          <span>ℹ️ {erreur}</span>
          {erreur.includes("démonstration") && (
            <button onClick={chargerDonnees} className="ml-4 text-amber-600 hover:text-amber-800 underline">
              Réessayer
            </button>
          )}
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">À faire</p>
          <p className="text-xl md:text-2xl font-bold text-slate-700">{stats.a_faire}</p>
        </div>
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">En cours</p>
          <p className="text-xl md:text-2xl font-bold text-blue-600">{stats.en_cours}</p>
        </div>
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Terminées</p>
          <p className="text-xl md:text-2xl font-bold text-green-600">{stats.terminee}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {/* Filtre statut */}
          <div className="flex flex-wrap gap-1.5">
            {statuts.map((s) => (
              <button
                key={s.id}
                onClick={() => setFiltreStatut(s.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-[2px] transition-colors ${
                  filtreStatut === s.id
                    ? s.color + " ring-2 ring-offset-1 ring-slate-300"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Filtre priorité */}
          <div className="flex flex-wrap gap-1.5 ml-2">
            {priorites.map((p) => (
              <button
                key={p.id}
                onClick={() => setFiltrePriorite(p.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-[2px] transition-colors ${
                  filtrePriorite === p.id
                    ? "bg-purple-100 text-purple-700 ring-2 ring-offset-1 ring-purple-300"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Filtre projet */}
          <div className="relative ml-2">
            <select
              value={filtreProjet}
              onChange={(e) => setFiltreProjet(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#63B23E] appearance-none bg-white pr-8"
            >
              <option value="tous">Tous les projets</option>
              {projets.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
            <ChevronDownIcon className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Recherche */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {tachesFiltres.length} tâche{tachesFiltres.length > 1 ? "s" : ""}
          </span>
          <form onSubmit={handleRechercheSubmit} className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={rechercheLocale}
              onChange={(e) => setRechercheLocale(e.target.value)}
              placeholder="Rechercher une tâche..."
              className="w-full pl-8 pr-8 py-1.5 text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
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

      {/* Chargement */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">Chargement des tâches…</span>
        </div>
      )}

      {/* Liste des tâches */}
      {!loading && (
        <>
          {tachesFiltres.length > 0 ? (
            vue === "kanban" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {["a_faire", "en_cours", "terminee"].map((statut) => (
                  <div key={statut} className="bg-slate-50 p-4 min-h-[200px]">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-slate-700">
                        {labelStatut[statut]}
                      </h3>
                      <span className="text-xs text-slate-400 bg-white px-2 py-0.5">
                        {tachesParStatut[statut].length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {tachesParStatut[statut].map((tache) => (
                        <TacheCard
                          key={tache.id}
                          tache={tache}
                          onStatutChange={handleStatutChange}
                          onDelete={handleDeleteTache}
                          projets={projets}
                          utilisateurs={utilisateurs}
                        />
                      ))}
                      {tachesParStatut[statut].length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">
                          Aucune tâche
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Titre</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Projet</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Statut</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Priorité</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Responsable</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Échéance</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {tachesFiltres.map((tache) => (
                        <tr key={tache.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">{tache.titre}</td>
                          <td className="px-4 py-3 text-slate-600">{tache.projet?.nom || "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs ${couleurStatut[tache.statut] || "bg-slate-100"}`}>
                              {labelStatut[tache.statut] || tache.statut}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs ${couleurPriorite[tache.priorite] || "bg-slate-100"}`}>
                              {labelPriorite[tache.priorite] || tache.priorite}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{tache.responsable ? `${tache.responsable.prenom} ${tache.responsable.nom}` : "-"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {tache.echeance ? new Date(tache.echeance).toLocaleDateString("fr-FR") : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <select
                                value={tache.statut}
                                onChange={(e) => handleStatutChange(tache.id, e.target.value)}
                                className="text-xs border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#63B23E]"
                              >
                                {statutOptions.map((s) => (
                                  <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleDeleteTache(tache.id)}
                                className="text-red-400 hover:text-red-600 transition-colors"
                              >
                                <CloseIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-12 bg-slate-50 border border-slate-200">
              {recherche || filtreStatut !== "tous" || filtrePriorite !== "tous" || filtreProjet !== "tous" ? (
                <>
                  <p className="text-slate-500">Aucune tâche ne correspond à vos filtres.</p>
                  <button
                    onClick={() => {
                      setFiltreStatut("tous");
                      setFiltrePriorite("tous");
                      setFiltreProjet("tous");
                      setRecherche("");
                      setRechercheLocale("");
                    }}
                    className="mt-2 text-[#63B23E] hover:underline"
                  >
                    Réinitialiser les filtres
                  </button>
                </>
              ) : (
                <>
                  <p className="text-slate-500">Aucune tâche pour le moment.</p>
                  <button
                    onClick={() => setModalOuvert(true)}
                    className="mt-4 px-4 py-2 bg-[#63B23E] text-white hover:bg-[#3F894E] transition-colors"
                  >
                    + Créer votre première tâche
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal de création */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate__animated animate__fadeIn">
          <div className="bg-white shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate__animated animate__zoomIn">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Nouvelle tâche</h2>
              <button
                onClick={() => setModalOuvert(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-4 space-y-4">
              {formErreur && (
                <div className="bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  ⚠️ {formErreur}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Projet <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    name="projet_id"
                    value={formData.projet_id}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 pr-10 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                  >
                    <option value="">Sélectionner un projet</option>
                    {projets.map((p) => (
                      <option key={p.id} value={p.id}>{p.nom}</option>
                    ))}
                  </select>
                  <ChevronDownIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Titre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="titre"
                  value={formData.titre}
                  onChange={handleFormChange}
                  required
                  placeholder="Ex: Créer la page d'accueil"
                  className="w-full px-3 py-2 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={3}
                  placeholder="Description de la tâche..."
                  className="w-full px-3 py-2 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Statut
                  </label>
                  <div className="relative">
                    <select
                      name="statut"
                      value={formData.statut}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 pr-10 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                    >
                      {statutOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Priorité
                  </label>
                  <div className="relative">
                    <select
                      name="priorite"
                      value={formData.priorite}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 pr-10 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                    >
                      {prioriteOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Responsable
                  </label>
                  <div className="relative">
                    <select
                      name="responsable_id"
                      value={formData.responsable_id}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 pr-10 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                    >
                      <option value="">Non assigné</option>
                      {utilisateurs.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.prenom} {u.nom} ({u.role})
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Échéance
                  </label>
                  <input
                    type="date"
                    name="echeance"
                    value={formData.echeance}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300  focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100  transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading || !formData.projet_id || !formData.titre.trim()}
                  className={`px-4 py-2 text-sm font-medium  transition-colors ${
                    formData.projet_id && formData.titre.trim()
                      ? "bg-[#63B23E] text-white hover:bg-[#3F894E]"
                      : "bg-slate-300 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {formLoading ? "Création..." : "Créer la tâche"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Composant TacheCard
function TacheCard({ tache, onStatutChange, onDelete, projets, utilisateurs }) {
  const [menuOuvert, setMenuOuvert] = useState(false);

  const couleurPriorite = {
    basse: "bg-slate-100 text-slate-600",
    moyenne: "bg-yellow-100 text-yellow-700",
    haute: "bg-orange-100 text-orange-700",
    critique: "bg-red-100 text-red-700",
  };

  const labelPriorite = {
    basse: "Basse",
    moyenne: "Moyenne",
    haute: "Haute",
    critique: "Critique",
  };

  const statutOptions = [
    { id: "a_faire", label: "À faire" },
    { id: "en_cours", label: "En cours" },
    { id: "terminee", label: "Terminée" },
  ];

  return (
    <div className="bg-white border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium text-slate-900 text-sm truncate flex-1">
          {tache.titre}
        </h4>
        <button
          onClick={() => setMenuOuvert(!menuOuvert)}
          className="text-slate-400 hover:text-slate-600 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
          </svg>
        </button>
      </div>

      {menuOuvert && (
        <div className="mt-2 space-y-1">
          <select
            value={tache.statut}
            onChange={(e) => {
              onStatutChange(tache.id, e.target.value);
              setMenuOuvert(false);
            }}
            className="w-full text-xs border border-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#63B23E]"
          >
            {statutOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={() => { onDelete(tache.id); setMenuOuvert(false); }}
            className="w-full text-xs text-red-600 hover:bg-red-50 px-2 py-1 text-left transition-colors"
          >
            Supprimer
          </button>
        </div>
      )}

      {tache.description && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tache.description}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className={`text-[10px] px-2 py-0.5 ${couleurPriorite[tache.priorite] || "bg-slate-100"}`}>
          {labelPriorite[tache.priorite] || tache.priorite}
        </span>
        {tache.echeance && (
          <span className="text-[10px] text-slate-400">
            📅 {new Date(tache.echeance).toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>

      {tache.responsable && (
        <div className="flex items-center gap-1 mt-1">
          <div className="w-5 h-5 bg-[#63B23E]/20 text-[#63B23E] flex items-center justify-center text-[8px] font-semibold">
            {tache.responsable.prenom?.charAt(0)}{tache.responsable.nom?.charAt(0)}
          </div>
          <span className="text-[10px] text-slate-500 truncate">
            {tache.responsable.prenom} {tache.responsable.nom}
          </span>
        </div>
      )}

      {tache.projet && (
        <div className="text-[10px] text-slate-400 mt-1 truncate">
          📁 {tache.projet.nom}
        </div>
      )}
    </div>
  );
}