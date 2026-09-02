// src/pages/ProjetDetail/index.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { projetsService } from "../../api/projets";
import { tachesService } from "../../api/taches";
import { utilisateursService } from "../../api/utilisateurs";
import { useAuth } from "../../auth/AuthContext";
import 'animate.css';

// Icônes SVG
const ArrowLeftIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
);

const EditIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

const PlusIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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

// Couleurs
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

const labelStatut = {
  vert: "Bon",
  orange: "Attention",
  rouge: "Critique",
};

const couleurStatutTache = {
  a_faire: "bg-slate-100 text-slate-700",
  en_cours: "bg-blue-100 text-blue-700",
  terminee: "bg-green-100 text-green-700",
};

const labelStatutTache = {
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

export default function ProjetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [projet, setProjet] = useState(null);
  const [taches, setTaches] = useState([]);
  const [membres, setMembres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [modalEditOuvert, setModalEditOuvert] = useState(false);
  const [modalTacheOuvert, setModalTacheOuvert] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formErreur, setFormErreur] = useState("");
  const [formData, setFormData] = useState({
    nom: "",
    description: "",
    client_id: "",
    responsable_id: "",
    date_debut: "",
    date_fin_prevue: "",
  });
  const [formTache, setFormTache] = useState({
    titre: "",
    description: "",
    statut: "a_faire",
    priorite: "moyenne",
    echeance: "",
    responsable_id: "",
  });

  useEffect(() => {
    chargerDonnees();
  }, [id]);

  const chargerDonnees = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [projetData, tachesData] = await Promise.all([
        projetsService.get(id),
        tachesService.listByProjet(id).catch(() => [])
      ]);
      
      setProjet(projetData);
      setTaches(tachesData || []);
      
      // Récupérer les membres du projet (si l'API existe)
      try {
        const membresData = await projetsService.getMembres(id);
        setMembres(membresData || []);
      } catch {
        setMembres([]);
      }
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur de chargement du projet.");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    if (projet) {
      setFormData({
        nom: projet.nom || "",
        description: projet.description || "",
        client_id: projet.client_id || "",
        responsable_id: projet.responsable_id || "",
        date_debut: projet.date_debut || "",
        date_fin_prevue: projet.date_fin_prevue || "",
      });
      setModalEditOuvert(true);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormErreur("");

    try {
      const updated = await projetsService.update(id, formData);
      setProjet(updated);
      setModalEditOuvert(false);
    } catch (err) {
      setFormErreur(err.response?.data?.detail || "Erreur lors de la mise à jour.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleTacheChange = (e) => {
    const { name, value } = e.target;
    setFormTache({ ...formTache, [name]: value });
  };

  const handleTacheSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormErreur("");

    try {
      const nouvelleTache = await tachesService.create({
        projet_id: parseInt(id),
        titre: formTache.titre,
        description: formTache.description || null,
        statut: formTache.statut,
        priorite: formTache.priorite,
        echeance: formTache.echeance || null,
        responsable_id: formTache.responsable_id ? parseInt(formTache.responsable_id) : null,
      });
      
      setTaches([nouvelleTache, ...taches]);
      setModalTacheOuvert(false);
      setFormTache({
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
      
      await tachesService.update(tacheId, { ...tache, statut: nouveauStatut });
      
      setTaches(taches.map(t => 
        t.id === tacheId ? { ...t, statut: nouveauStatut } : t
      ));
    } catch (err) {
      alert("Erreur lors du changement de statut.");
    }
  };

  const handleDeleteTache = async (tacheId) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette tâche ?")) return;
    
    try {
      await tachesService.delete(tacheId);
      setTaches(taches.filter(t => t.id !== tacheId));
    } catch (err) {
      alert("Erreur lors de la suppression de la tâche.");
    }
  };

  // Statistiques des tâches
  const statsTaches = {
    total: taches.length,
    a_faire: taches.filter(t => t.statut === "a_faire").length,
    en_cours: taches.filter(t => t.statut === "en_cours").length,
    terminee: taches.filter(t => t.statut === "terminee").length,
  };

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
        <span className="ml-3 text-slate-500">Chargement du projet…</span>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">⚠️ {erreur}</p>
        <button onClick={() => navigate("/projets")} className="mt-4 text-[#63B23E] hover:underline">
          Retour à la liste des projets
        </button>
      </div>
    );
  }

  if (!projet) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Projet non trouvé.</p>
        <button onClick={() => navigate("/projets")} className="mt-4 text-[#63B23E] hover:underline">
          Retour à la liste des projets
        </button>
      </div>
    );
  }

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* Navigation */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/projets")}
          className="p-2 rounded-md hover:bg-slate-100 transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
              {projet.nom}
            </h1>
            <span
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                couleurStatut[projet.statut_sante] || "bg-slate-100 text-slate-700"
              }`}
            >
              {statutIcone[projet.statut_sante] || "⚪"} {labelStatut[projet.statut_sante] || projet.statut_sante}
            </span>
          </div>
          <button
            onClick={handleEditClick}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <EditIcon className="w-4 h-4" />
            Modifier
          </button>
        </div>
      </div>

      {/* Informations du projet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Informations générales</h2>
          <div className="space-y-2 text-sm">
            {projet.description && (
              <p className="text-slate-600">{projet.description}</p>
            )}
            <div className="flex items-center gap-2 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              Client: <span className="text-slate-700 font-medium">{projet.client?.nom || "Non défini"}</span>
            </div>
            {projet.responsable && (
              <div className="flex items-center gap-2 text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Responsable: <span className="text-slate-700 font-medium">{projet.responsable.prenom} {projet.responsable.nom}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              Début: <span className="text-slate-700">{projet.date_debut ? new Date(projet.date_debut).toLocaleDateString("fr-FR") : "Non définie"}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              Fin prévue: <span className="text-slate-700">{projet.date_fin_prevue ? new Date(projet.date_fin_prevue).toLocaleDateString("fr-FR") : "Non définie"}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Avancement</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500">Progression</span>
                <span className="font-medium text-slate-700">{projet.avancement_pct || 0}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 rounded p-2">
                <p className="text-xs text-slate-500">À faire</p>
                <p className="text-lg font-bold text-slate-700">{statsTaches.a_faire}</p>
              </div>
              <div className="bg-slate-50 rounded p-2">
                <p className="text-xs text-slate-500">En cours</p>
                <p className="text-lg font-bold text-blue-600">{statsTaches.en_cours}</p>
              </div>
              <div className="bg-slate-50 rounded p-2">
                <p className="text-xs text-slate-500">Terminées</p>
                <p className="text-lg font-bold text-green-600">{statsTaches.terminee}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Membres */}
      {membres.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Équipe</h2>
          <div className="flex flex-wrap gap-2">
            {membres.map((membre) => (
              <div key={membre.id} className="flex items-center gap-2 bg-slate-50 rounded-full px-3 py-1.5">
                <div className="w-6 h-6 rounded-full bg-[#63B23E]/20 text-[#63B23E] flex items-center justify-center text-xs font-semibold">
                  {membre.prenom?.charAt(0)}{membre.nom?.charAt(0)}
                </div>
                <span className="text-sm text-slate-700">{membre.prenom} {membre.nom}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tâches */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Tâches ({taches.length})</h2>
          <button
            onClick={() => setModalTacheOuvert(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#63B23E] text-white rounded-md hover:bg-[#3F894E] transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Ajouter
          </button>
        </div>

        {taches.length > 0 ? (
          <div className="space-y-2">
            {taches.map((tache) => (
              <div
                key={tache.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-slate-900 text-sm truncate">
                      {tache.titre}
                    </h3>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full ${couleurPriorite[tache.priorite] || "bg-slate-100"}`}>
                      {labelPriorite[tache.priorite] || tache.priorite}
                    </span>
                  </div>
                  {tache.responsable && (
                    <p className="text-xs text-slate-500 truncate">
                      👤 {tache.responsable.prenom} {tache.responsable.nom}
                    </p>
                  )}
                  {tache.echeance && (
                    <p className="text-xs text-slate-400">
                      📅 {new Date(tache.echeance).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <select
                    value={tache.statut}
                    onChange={(e) => handleStatutChange(tache.id, e.target.value)}
                    className="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#63B23E]"
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
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">
            Aucune tâche pour ce projet.
            <button
              onClick={() => setModalTacheOuvert(true)}
              className="block mx-auto mt-2 text-[#63B23E] hover:underline"
            >
              Créer la première tâche
            </button>
          </p>
        )}
      </div>

      {/* Modal Édition Projet */}
      {modalEditOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate__animated animate__fadeIn">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate__animated animate__zoomIn">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Modifier le projet</h2>
              <button
                onClick={() => setModalEditOuvert(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-4 space-y-4">
              {formErreur && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  ⚠️ {formErreur}
                </div>
              )}

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
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm resize-none"
                />
              </div>

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

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalEditOuvert(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2 text-sm font-medium bg-[#63B23E] text-white rounded-md hover:bg-[#3F894E] transition-colors disabled:opacity-50"
                >
                  {formLoading ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ajout Tâche */}
      {modalTacheOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate__animated animate__fadeIn">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate__animated animate__zoomIn">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Nouvelle tâche</h2>
              <button
                onClick={() => setModalTacheOuvert(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTacheSubmit} className="p-4 space-y-4">
              {formErreur && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  ⚠️ {formErreur}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Titre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="titre"
                  value={formTache.titre}
                  onChange={handleTacheChange}
                  required
                  placeholder="Ex: Créer la page d'accueil"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formTache.description}
                  onChange={handleTacheChange}
                  rows={2}
                  placeholder="Description de la tâche..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Statut
                  </label>
                  <select
                    name="statut"
                    value={formTache.statut}
                    onChange={handleTacheChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                  >
                    {statutOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Priorité
                  </label>
                  <select
                    name="priorite"
                    value={formTache.priorite}
                    onChange={handleTacheChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                  >
                    {prioriteOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Responsable
                  </label>
                  <select
                    name="responsable_id"
                    value={formTache.responsable_id}
                    onChange={handleTacheChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm appearance-none bg-white"
                  >
                    <option value="">Non assigné</option>
                    {membres.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.prenom} {m.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Échéance
                  </label>
                  <input
                    type="date"
                    name="echeance"
                    value={formTache.echeance}
                    onChange={handleTacheChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalTacheOuvert(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formLoading || !formTache.titre.trim()}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    formTache.titre.trim()
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