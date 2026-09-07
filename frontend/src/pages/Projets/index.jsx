// src/pages/Projets/index.jsx — liste + création de projets (RF-05, RF-06).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projetsService } from "../../api/projets";
import { clientsService } from "../../api/client";
import { utilisateursService } from "../../api/utilisateurs";
import { useLang } from "../../i18n/LangContext";
import { useMessage } from "../../context/MessageContext";
import 'animate.css';

// Icônes SVG
const PlusIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const EditIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

const CloseIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UserIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const BuildingIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M3.75 21V6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25V21m-13.5 0h10.5m-10.5 0v-9.75A2.25 2.25 0 016 9h12a2.25 2.25 0 012.25 2.25V21" />
  </svg>
);

const CalendarIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
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

const getStatutLabel = (statut) => {
  const labels = { vert: "Bon", orange: "Attention", rouge: "Critique" };
  return labels[statut] || statut;
};

const FORM_VIDE = {
  nom: "",
  description: "",
  client_id: "",
  responsable_id: "",
  date_debut: "",
  date_fin_prevue: "",
};

export default function Projets() {
  const navigate = useNavigate();
  const { t } = useLang();
  const { showSuccess, showError, showWarning } = useMessage();

  const [projets, setProjets] = useState([]);
  const [clients, setClients] = useState([]);
  const [responsables, setResponsables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [recherche, setRecherche] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [modalEditionOuvert, setModalEditionOuvert] = useState(false);
  const [projetEdition, setProjetEdition] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    charger();
  }, []);

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [projetsData, clientsData, usersData] = await Promise.all([
        projetsService.list(),
        clientsService.list().catch(() => []),
        utilisateursService.list().catch(() => []),
      ]);
      setProjets(projetsData || []);
      setClients(clientsData || []);
      setResponsables(
        (usersData || []).filter(
          (u) => u.role === "direction" || u.role === "admin"
        )
      );
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement des projets.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErreur("");
    
    if (!form.nom.trim()) {
      const msg = "Le nom du projet est requis.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.client_id) {
      const msg = "Veuillez choisir un client.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.responsable_id) {
      const msg = "Veuillez choisir un responsable.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_debut) {
      const msg = "La date de début est requise.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_fin_prevue) {
      const msg = "La date de fin prévue est requise.";
      setFormErreur(msg);
      showError(msg);
      return;
    }

    setEnCours(true);
    try {
      await projetsService.create({
        nom: form.nom,
        description: form.description || null,
        client_id: parseInt(form.client_id, 10),
        responsable_id: parseInt(form.responsable_id, 10),
        date_debut: form.date_debut || null,
        date_fin_prevue: form.date_fin_prevue || null,
      });
      showSuccess("Le projet a été créé avec succès !");
      setModalOuvert(false);
      setForm(FORM_VIDE);
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de la création du projet.";
      setFormErreur(msg);
      showError(msg);
    } finally {
      setEnCours(false);
    }
  };

  const ouvrirEdition = (projet, e) => {
    e.stopPropagation();
    setProjetEdition(projet);
    setForm({
      nom: projet.nom || "",
      description: projet.description || "",
      client_id: String(projet.client_id || ""),
      responsable_id: String(projet.responsable_id || ""),
      date_debut: projet.date_debut || "",
      date_fin_prevue: projet.date_fin_prevue || "",
    });
    setFormErreur("");
    setModalEditionOuvert(true);
  };

  const handleEditionSubmit = async (e) => {
    e.preventDefault();
    setFormErreur("");
    
    if (!form.nom.trim()) {
      const msg = "Le nom du projet est requis.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.client_id) {
      const msg = "Veuillez choisir un client.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.responsable_id) {
      const msg = "Veuillez choisir un responsable.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_debut) {
      const msg = "La date de début est requise.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_fin_prevue) {
      const msg = "La date de fin prévue est requise.";
      setFormErreur(msg);
      showError(msg);
      return;
    }

    setEnCours(true);
    try {
      await projetsService.update(projetEdition.id, {
        nom: form.nom,
        description: form.description || null,
        client_id: parseInt(form.client_id, 10),
        responsable_id: parseInt(form.responsable_id, 10),
        date_debut: form.date_debut || null,
        date_fin_prevue: form.date_fin_prevue || null,
      });
      showSuccess("Le projet a été modifié avec succès !");
      setModalEditionOuvert(false);
      setProjetEdition(null);
      setForm(FORM_VIDE);
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de la modification du projet.";
      setFormErreur(msg);
      showError(msg);
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async (projet, e) => {
    e.stopPropagation();
    
    const confirmed = await new Promise((resolve) => {
      const container = document.createElement("div");
      container.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate__animated animate__fadeIn";
      document.body.appendChild(container);

      const ConfirmationDialog = () => {
        const [visible, setVisible] = useState(true);

        const handleConfirm = () => {
          setVisible(false);
          setTimeout(() => {
            if (container.parentNode) container.parentNode.removeChild(container);
            resolve(true);
          }, 300);
        };

        const handleCancel = () => {
          setVisible(false);
          setTimeout(() => {
            if (container.parentNode) container.parentNode.removeChild(container);
            resolve(false);
          }, 300);
        };

        return (
          <div className={`bg-white shadow-xl max-w-md w-full p-6 animate__animated animate__zoomIn ${!visible ? "animate__animated animate__zoomOut" : ""}`}>
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-semibold">Confirmation de suppression</h3>
            </div>
            <p className="text-slate-600 mb-2">
              Supprimer définitivement le projet :
            </p>
            <p className="font-medium text-slate-800 bg-slate-50 p-2 rounded mb-4">
              « {projet.nom} »
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Ses tâches, jalons et membres seront aussi supprimés.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        );
      };

      import("react-dom/client").then(({ createRoot }) => {
        const root = createRoot(container);
        root.render(<ConfirmationDialog />);
      });
    });

    if (!confirmed) return;

    try {
      await projetsService.remove(projet.id);
      setProjets((prev) => prev.filter((p) => p.id !== projet.id));
      showSuccess(`Le projet "${projet.nom}" a été supprimé.`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de la suppression du projet.";
      showError(msg);
    }
  };

  const nomClient = (id) => clients.find((c) => c.id === id)?.nom || "—";
  const nomResponsable = (id) => responsables.find((r) => r.id === id)?.prenom + " " + responsables.find((r) => r.id === id)?.nom || "—";

  const projetsFiltres = projets.filter(projet => {
    if (filtreStatut !== "tous" && projet.statut_sante !== filtreStatut) return false;
    if (recherche) {
      const search = recherche.toLowerCase();
      const nom = projet.nom?.toLowerCase() || "";
      const client = nomClient(projet.client_id).toLowerCase();
      if (!nom.includes(search) && !client.includes(search)) return false;
    }
    return true;
  });

  const statuts = [
    { id: "tous", label: "Tous", color: "bg-slate-100 text-slate-700" },
    { id: "vert", label: "🟢 Bon", color: "bg-green-100 text-green-800" },
    { id: "orange", label: "🟠 Attention", color: "bg-orange-100 text-orange-800" },
    { id: "rouge", label: "🔴 Critique", color: "bg-red-100 text-red-800" },
  ];

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("projets.titre")}
          </h1>
          <p className="text-sm text-slate-500">
            {projets.length} projet{projets.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            setForm(FORM_VIDE);
            setFormErreur("");
            setModalOuvert(true);
          }}
          className="flex items-center gap-2 bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white rounded-md transition hover:bg-[#4a8f2e]"
        >
          <PlusIcon className="w-4 h-4" />
          {t("projets.nouveau")}
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {statuts.map((s) => (
            <button
              key={s.id}
              onClick={() => setFiltreStatut(s.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filtreStatut === s.id
                  ? s.color + " ring-2 ring-offset-1 ring-slate-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[150px]">
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un projet..."
            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
          />
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {projetsFiltres.length} projet{projetsFiltres.length > 1 ? "s" : ""}
        </span>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">{t("common.chargement")}</span>
        </div>
      )}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && projetsFiltres.length === 0 && (
        <div className="border border-dashed border-slate-300 p-10 text-center text-slate-500 rounded-lg">
          {recherche || filtreStatut !== "tous" ? (
            <>
              <p>Aucun projet ne correspond à vos filtres.</p>
              <button
                onClick={() => { setFiltreStatut("tous"); setRecherche(""); }}
                className="mt-2 text-[#63B23E] hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </>
          ) : (
            <p>{t("projets.vide")}</p>
          )}
        </div>
      )}

      {/* Grille des projets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projetsFiltres.map((p, index) => (
          <div
            key={p.id}
            onClick={() => navigate(`/projets/${p.id}`)}
            className="group relative cursor-pointer border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#63B23E] rounded-lg animate__animated animate__fadeInUp"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* En-tête avec nom et statut */}
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-semibold text-slate-900 truncate text-sm md:text-base flex-1">
                {p.nom}
              </h2>
              <span
                className={`flex items-center gap-2 shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${
                  couleurStatut[p.statut_sante] || "bg-slate-100 text-slate-700"
                }`}
              >
                <span className="text-xs">{statutIcone[p.statut_sante] || "⚪"}</span>
                <span className="hidden sm:inline">{getStatutLabel(p.statut_sante)}</span>
              </span>
            </div>

            {/* Informations du projet */}
            <div className="space-y-1.5 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <BuildingIcon className="w-3.5 h-3.5" />
                <span>{t("projets.client")} : {nomClient(p.client_id)}</span>
              </div>
              {p.responsable_id && (
                <div className="flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Responsable : {nomResponsable(p.responsable_id)}</span>
                </div>
              )}
              {p.date_debut && (
                <div className="flex items-center gap-1">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>Début : {new Date(p.date_debut).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
              {p.date_fin_prevue && (
                <div className="flex items-center gap-1">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>Fin : {new Date(p.date_fin_prevue).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
            </div>

            {/* Barre de progression */}
            <div className="mt-3">
              <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (p.avancement_pct || 0) >= 80
                      ? "bg-green-500"
                      : (p.avancement_pct || 0) >= 40
                      ? "bg-yellow-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${p.avancement_pct || 0}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-500">
                  {p.avancement_pct || 0}% {t("dash.termine")}
                </p>
                <span className="text-xs text-slate-400">
                  {p.taches_terminees || 0}/{p.taches_total || 0} tâches
                </span>
              </div>
            </div>

            {/* Boutons actions en bas à droite - toujours visibles sur desktop */}
            <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={(e) => ouvrirEdition(p, e)}
                title="Modifier le projet"
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                <EditIcon className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => supprimer(p, e)}
                title="Supprimer le projet"
                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal création */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-lg bg-white p-6 shadow-xl rounded-lg animate__animated animate__zoomIn">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {t("projets.modal.titre")}
              </h2>
              <button
                onClick={() => setModalOuvert(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {formErreur && (
              <div className="mb-3 bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200 rounded-md">
                ⚠️ {formErreur}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("projets.form.nom")} <span className="text-red-500">*</span>
                </label>
                <input
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  placeholder="Site vitrine…"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("projets.form.description")}
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent resize-none"
                  placeholder="Description optionnelle..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.client")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="client_id"
                    value={form.client_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent appearance-none bg-white"
                  >
                    <option value="">— Choisir —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.responsable")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="responsable_id"
                    value={form.responsable_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent appearance-none bg-white"
                  >
                    <option value="">— Choisir —</option>
                    {responsables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.prenom} {r.nom} ({r.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.dateDebut")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="date_debut"
                    value={form.date_debut}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.dateFin")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="date_fin_prevue"
                    value={form.date_fin_prevue}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
              </div>

              {clients.length === 0 && (
                <p className="text-xs text-amber-600">
                  ⚠️ Aucun client disponible — créez d'abord un client.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  {t("common.annuler")}
                </button>
                <button
                  type="submit"
                  disabled={enCours}
                  className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white rounded-md transition hover:bg-[#4a8f2e] disabled:opacity-50"
                >
                  {enCours ? t("common.enregistrement") : t("projets.form.creer")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Édition */}
      {modalEditionOuvert && projetEdition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-lg bg-white p-6 shadow-xl rounded-lg animate__animated animate__zoomIn">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                Modifier le projet
              </h2>
              <button
                onClick={() => {
                  setModalEditionOuvert(false);
                  setProjetEdition(null);
                }}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {formErreur && (
              <div className="mb-3 bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200 rounded-md">
                ⚠️ {formErreur}
              </div>
            )}

            <form onSubmit={handleEditionSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("projets.form.nom")} <span className="text-red-500">*</span>
                </label>
                <input
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  placeholder="Site vitrine…"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t("projets.form.description")}
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent resize-none"
                  placeholder="Description optionnelle..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.client")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="client_id"
                    value={form.client_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent appearance-none bg-white"
                  >
                    <option value="">— Choisir —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.responsable")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="responsable_id"
                    value={form.responsable_id}
                    onChange={handleChange}
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent appearance-none bg-white"
                  >
                    <option value="">— Choisir —</option>
                    {responsables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.prenom} {r.nom} ({r.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.dateDebut")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="date_debut"
                    value={form.date_debut}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t("projets.form.dateFin")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="date_fin_prevue"
                    value={form.date_fin_prevue}
                    onChange={handleChange}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setModalEditionOuvert(false);
                    setProjetEdition(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  {t("common.annuler")}
                </button>
                <button
                  type="submit"
                  disabled={enCours}
                  className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white rounded-md transition hover:bg-[#4a8f2e] disabled:opacity-50"
                >
                  {enCours ? t("common.enregistrement") : "Modifier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}