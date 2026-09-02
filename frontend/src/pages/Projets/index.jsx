// src/pages/Projets/index.jsx
import { useState, useEffect } from "react";
import { projetsService } from "../../api/projets";
import { clientsService } from "../../api/client";
import { utilisateursService } from "../../api/utilisateurs"; // Nouveau service
import { useAuth } from "../../auth/AuthContext";
import 'animate.css';

// Icônes SVG
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

export default function Projets() {
  const { user } = useAuth();
  const [projets, setProjets] = useState([]);
  const [clients, setClients] = useState([]);
  const [responsables, setResponsables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [recherche, setRecherche] = useState("");
  const [rechercheLocale, setRechercheLocale] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [formData, setFormData] = useState({
    nom: "",
    description: "",
    client_id: "",
    responsable_id: "",
    date_debut: "",
    date_fin_prevue: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formErreur, setFormErreur] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    enCours: 0,
    termines: 0,
    enRetard: 0,
  });

  useEffect(() => {
    chargerDonnees();
  }, []);

  const chargerDonnees = async () => {
    setLoading(true);
    try {
      // Charger projets, clients et responsables en parallèle
      const [projetsData, clientsData, responsablesData] = await Promise.all([
        projetsService.list(),
        clientsService.list().catch(() => []),
        utilisateursService.list().catch(() => [])
      ]);
      
      setProjets(projetsData || []);
      setClients(clientsData || []);
      setResponsables(responsablesData || []);
      calculerStats(projetsData || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur de chargement des données.");
    } finally {
      setLoading(false);
    }
  };

  const calculerStats = (data) => {
    const total = data.length;
    const enCours = data.filter(p => p.avancement_pct < 100).length;
    const termines = data.filter(p => p.avancement_pct === 100).length;
    const enRetard = data.filter(p => p.statut_sante === "rouge" || p.statut_sante === "orange").length;
    setStats({ total, enCours, termines, enRetard });
  };

  const getStatutLabel = (statut) => {
    const labels = { vert: "Bon", orange: "Attention", rouge: "Critique" };
    return labels[statut] || statut;
  };

  // Filtrage des projets
  const projetsFiltres = projets.filter(projet => {
    if (filtreStatut === "enCours" && projet.avancement_pct === 100) return false;
    if (filtreStatut === "termines" && projet.avancement_pct !== 100) return false;
    if (filtreStatut === "enRetard") {
      if (projet.statut_sante !== "rouge" && projet.statut_sante !== "orange") return false;
    }

    if (recherche) {
      const search = recherche.toLowerCase();
      const nom = projet.nom?.toLowerCase() || "";
      const clientNom = projet.client?.nom?.toLowerCase() || projet.client?.toLowerCase() || "";
      const responsableNom = projet.responsable?.nom?.toLowerCase() || "";
      if (!nom.includes(search) && !clientNom.includes(search) && !responsableNom.includes(search)) return false;
    }

    return true;
  });

  const handleRechercheSubmit = (e) => {
    e.preventDefault();
    setRecherche(rechercheLocale);
  };

  const handleRechercheClear = () => {
    setRechercheLocale("");
    setRecherche("");
  };

  const handleStatutClick = (statut) => {
    setFiltreStatut(statut === filtreStatut ? "tous" : statut);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormErreur("");

    // Validation
    if (!formData.nom.trim()) {
      setFormErreur("Le nom du projet est requis.");
      setFormLoading(false);
      return;
    }
    if (!formData.client_id) {
      setFormErreur("Veuillez sélectionner un client.");
      setFormLoading(false);
      return;
    }

    try {
      const nouveauProjet = await projetsService.create({
        nom: formData.nom,
        description: formData.description || null,
        client_id: parseInt(formData.client_id),
        responsable_id: formData.responsable_id ? parseInt(formData.responsable_id) : null,
        date_debut: formData.date_debut || null,
        date_fin_prevue: formData.date_fin_prevue || null,
      });
      
      // Ajouter les relations pour l'affichage
      const clientTrouve = clients.find(c => c.id === parseInt(formData.client_id));
      if (clientTrouve) {
        nouveauProjet.client = clientTrouve;
      }
      
      if (formData.responsable_id) {
        const responsableTrouve = responsables.find(r => r.id === parseInt(formData.responsable_id));
        if (responsableTrouve) {
          nouveauProjet.responsable = responsableTrouve;
        }
      }
      
      setProjets([nouveauProjet, ...projets]);
      calculerStats([nouveauProjet, ...projets]);
      setModalOuvert(false);
      setFormData({
        nom: "",
        description: "",
        client_id: "",
        responsable_id: "",
        date_debut: "",
        date_fin_prevue: "",
      });
    } catch (err) {
      setFormErreur(err.response?.data?.detail || "Erreur lors de la création du projet.");
    } finally {
      setFormLoading(false);
    }
  };

  const statuts = [
    { id: "tous", label: "Tous", color: "bg-slate-100 text-slate-700" },
    { id: "enCours", label: "En cours", color: "bg-blue-100 text-blue-700" },
    { id: "termines", label: "Terminés", color: "bg-green-100 text-green-700" },
    { id: "enRetard", label: "En retard", color: "bg-red-100 text-red-700" },
  ];

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
            Projets
          </h1>
          <p className="text-sm text-slate-500">
            Gérez tous vos projets depuis cet espace.
          </p>
        </div>
        <button
          onClick={() => setModalOuvert(true)}
          className="mt-2 sm:mt-0 flex items-center gap-2 px-4 py-2 bg-[#63B23E] text-white text-sm hover:bg-[#3F894E] transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Nouveau projet
        </button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">En cours</p>
          <p className="text-xl md:text-2xl font-bold text-blue-600">{stats.enCours}</p>
        </div>
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Terminés</p>
          <p className="text-xl md:text-2xl font-bold text-green-600">{stats.termines}</p>
        </div>
        <div className="bg-white border border-slate-200 p-3 md:p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">En retard</p>
          <p className="text-xl md:text-2xl font-bold text-red-600">{stats.enRetard}</p>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {statuts.map((s) => (
            <button
              key={s.id}
              onClick={() => handleStatutClick(s.id)}
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

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {projetsFiltres.length} projet{projetsFiltres.length > 1 ? "s" : ""}
          </span>
          <form onSubmit={handleRechercheSubmit} className="relative">
            <input
              type="text"
              value={rechercheLocale}
              onChange={(e) => setRechercheLocale(e.target.value)}
              placeholder="Rechercher..."
              className="w-48 sm:w-56 pl-8 pr-8 py-1.5 text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
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
          <span className="ml-3 text-slate-500">Chargement des projets…</span>
        </div>
      )}

      {/* Erreur */}
      {erreur && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
          <div className="flex items-center justify-between">
            <span>⚠️ {erreur}</span>
            <button onClick={chargerDonnees} className="text-red-600 hover:text-red-800 underline">
              Réessayer
            </button>
          </div>
        </div>
      )}

      {/* Grille des projets */}
      {!loading && !erreur && (
        <>
          {projetsFiltres.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {projetsFiltres.map((projet) => (
                <div
                  key={projet.id}
                  className="group border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:border-[#63B23E]"
                  onClick={() => window.location.href = `/projets/${projet.id}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-slate-900 truncate text-sm md:text-base">
                      {projet.nom || "Sans nom"}
                    </h2>
                    <span
                      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap flex-shrink-0 ${
                        couleurStatut[projet.statut_sante] || "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <span className="text-xs">{statutIcone[projet.statut_sante] || "⚪"}</span>
                      <span className="hidden sm:inline text-xs">{getStatutLabel(projet.statut_sante)}</span>
                    </span>
                  </div>

                  {/* Client */}
                  {projet.client && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-1 truncate">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      {projet.client.nom || projet.client}
                    </div>
                  )}

                  {/* Responsable */}
                  {projet.responsable && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-2 truncate">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      <span className="text-slate-400">Resp:</span> {projet.responsable.nom || projet.responsable}
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

                  {projet.date_fin_prevue && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      {new Date(projet.date_fin_prevue).toLocaleDateString("fr-FR")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
              {recherche || filtreStatut !== "tous" ? (
                <>
                  <p className="text-slate-500">Aucun projet ne correspond à vos filtres.</p>
                  <button
                    onClick={() => { setFiltreStatut("tous"); setRecherche(""); setRechercheLocale(""); }}
                    className="mt-2 text-[#63B23E] hover:underline"
                  >
                    Réinitialiser les filtres
                  </button>
                </>
              ) : (
                <>
                  <p className="text-slate-500">Aucun projet pour le moment.</p>
                  <button
                    onClick={() => setModalOuvert(true)}
                    className="mt-4 px-4 py-2 bg-[#63B23E] text-white rounded-md hover:bg-[#3F894E] transition-colors"
                  >
                    + Créer votre premier projet
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal de création avec tous les attributs */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate__animated animate__fadeIn">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate__animated animate__zoomIn">
            {/* En-tête */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Nouveau projet</h2>
              <button
                onClick={() => setModalOuvert(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleFormSubmit} className="p-4 space-y-4">
              {formErreur && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  ⚠️ {formErreur}
                </div>
              )}

              {/* Nom du projet */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nom du projet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="nom"
                  value={formData.nom}
                  onChange={handleFormChange}
                  required
                  placeholder="Ex: Site Web Kanto"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={3}
                  placeholder="Description du projet..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm resize-none"
                />
              </div>

              {/* Client - Obligatoire */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Client <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    name="client_id"
                    value={formData.client_id}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.nom} {client.prenom ? `- ${client.prenom}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {clients.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    ⚠️ Aucun client disponible. Veuillez d'abord créer un client.
                  </p>
                )}
              </div>

              {/* Responsable - Optionnel */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Responsable
                </label>
                <div className="relative">
                  <select
                    name="responsable_id"
                    value={formData.responsable_id}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                  >
                    <option value="">Aucun responsable</option>
                    {responsables.map((resp) => (
                      <option key={resp.id} value={resp.id}>
                        {resp.prenom} {resp.nom} ({resp.role})
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Date début
                  </label>
                  <input
                    type="date"
                    name="date_debut"
                    value={formData.date_debut}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Date fin prévue
                  </label>
                  <input
                    type="date"
                    name="date_fin_prevue"
                    value={formData.date_fin_prevue}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
                  />
                </div>
              </div>

              {/* Boutons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading || !formData.client_id || !formData.nom.trim()}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    formData.client_id && formData.nom.trim()
                      ? "bg-[#63B23E] text-white hover:bg-[#3F894E]"
                      : "bg-slate-300 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {formLoading ? "Création..." : "Créer le projet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}