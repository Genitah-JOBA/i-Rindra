// src/pages/Projets/index.jsx — liste des projets (RF-05, RF-06).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projetsService } from "../../api/projets";
import { clientsService } from "../../api/client";
import { utilisateursService } from "../../api/utilisateurs";
import { useLang } from "../../i18n/LangContext";
import { useMessage } from "../../context/MessageContext";
import 'animate.css';

// Icônes SVG
const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const ArchiveIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
  </svg>
);

const RestoreIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
  </svg>
);

const ChatIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
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

export default function Projets() {
  const navigate = useNavigate();
  const { t } = useLang();
  const { showSuccess, showError, showConfirm } = useMessage();

  const [projets, setProjets] = useState([]);
  const [clients, setClients] = useState([]);
  const [responsables, setResponsables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [filtreArchive, setFiltreArchive] = useState("actifs");
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    charger();
  }, [filtreArchive]);

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [projetsData, clientsData, usersData] = await Promise.all([
        projetsService.list(
          filtreArchive === "tous"
            ? {}
            : { archive: filtreArchive === "archives" }
        ),
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

  // ---------- SUPPRIMER ----------
  const supprimer = async (projet, e) => {
    e?.stopPropagation();

    const ok = await showConfirm({
      type: 'error',
      title: 'Confirmation de suppression',
      message: (
        <>
          <p>Supprimer définitivement le projet :</p>
          <p className="font-medium text-slate-800 bg-slate-50 p-2 rounded my-2">
            « {projet.nom} »
          </p>
          <p className="text-sm text-slate-500">
            Ses tâches, jalons et membres seront aussi supprimés.
          </p>
        </>
      ),
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
    });

    if (!ok) return;

    try {
      await projetsService.remove(projet.id);
      setProjets((prev) => prev.filter((p) => p.id !== projet.id));
      showSuccess(`Le projet "${projet.nom}" a été supprimé.`);
    } catch (err) {
      showError(err.response?.data?.detail || "Erreur lors de la suppression.");
    }
  };

  // ---------- ARCHIVER ----------
  const archiver = async (projet, e) => {
    e?.stopPropagation();

    const ok = await showConfirm({
      type: 'warning',
      title: "Confirmation d'archivage",
      message: (
        <>
          <p>Archiver le projet :</p>
          <p className="font-medium text-slate-800 bg-slate-50 p-2 rounded my-2">
            « {projet.nom} »
          </p>
        </>
      ),
      confirmLabel: 'Archiver',
      cancelLabel: 'Annuler',
    });

    if (!ok) return;

    try {
      await projetsService.archiver(projet.id);
      showSuccess(`Le projet "${projet.nom}" a été archivé.`);
      await charger();
    } catch (err) {
      showError(err.response?.data?.detail || "Erreur lors de l'archivage.");
    }
  };

  // ---------- RESTAURER ----------
  const restaurer = async (projet, e) => {
    e?.stopPropagation();

    const ok = await showConfirm({
      type: 'info',
      title: 'Confirmation de restauration',
      message: (
        <>
          <p>Restaurer le projet :</p>
          <p className="font-medium text-slate-800 bg-slate-50 p-2 rounded my-2">
            « {projet.nom} »
          </p>
        </>
      ),
      confirmLabel: 'Restaurer',
      cancelLabel: 'Annuler',
    });

    if (!ok) return;

    try {
      await projetsService.desarchiver(projet.id);
      showSuccess(`Le projet "${projet.nom}" a été restauré.`);
      await charger();
    } catch (err) {
      showError(err.response?.data?.detail || "Erreur lors de la restauration.");
    }
  };

  // ---------- CHAT (redirection e-resaka) ----------
  const chat = (projet, e) => {
    e?.stopPropagation();
    // Ouvrir le chat du projet dans e-resaka
    const url = `https://e-resaka.example.com/chat?projet=${projet.id}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {statuts.map((s) => (
            <button
              key={s.id}
              onClick={() => setFiltreStatut(s.id)}
              className={`px-3 py-1.5 text-xs font-medium  transition-colors ${
                filtreStatut === s.id
                  ? s.color + " ring-2 ring-offset-1 ring-slate-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "actifs", label: "Actifs" },
            { id: "archives", label: "Archivés" },
            { id: "tous", label: "Tous" },
          ].map((a) => (
            <button
              key={a.id}
              onClick={() => setFiltreArchive(a.id)}
              className={`px-3 py-1.5 text-xs font-medium  transition-colors ${
                filtreArchive === a.id
                  ? "bg-slate-800 text-white ring-2 ring-offset-1 ring-slate-400"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[150px]">
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un projet..."
            className="w-full px-3 py-1.5 text-sm border border-slate-300  focus:outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
          />
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {projetsFiltres.length} projet{projetsFiltres.length > 1 ? "s" : ""}
        </span>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin  h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">{t("common.chargement")}</span>
        </div>
      )}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && projetsFiltres.length === 0 && (
        <div className="border border-dashed border-slate-300 p-10 text-center text-slate-500 ">
          {recherche || filtreStatut !== "tous" || filtreArchive !== "actifs" ? (
            <>
              <p>Aucun projet ne correspond à vos filtres.</p>
              <button
                onClick={() => { setFiltreStatut("tous"); setRecherche(""); setFiltreArchive("actifs"); }}
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
            className="group relative cursor-pointer border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#63B23E]  animate__animated animate__fadeInUp"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* En-tête avec nom et statut */}
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2
                className={`truncate text-sm md:text-base flex-1 ${
                  p.archive ? "font-semibold text-slate-400 line-through" : "font-semibold text-slate-900"
                }`}
              >
                {p.nom}
              </h2>
              {p.archive ? (
                <span className="flex items-center gap-1 shrink-0 px-2 py-0.5 text-xs font-medium  bg-slate-200 text-slate-600">
                  <ArchiveIcon className="w-3 h-3" />
                  <span className="hidden sm:inline">Archivé</span>
                </span>
              ) : (
                <span
                  className={`flex items-center gap-2 shrink-0 px-2 py-0.5 text-xs font-medium  ${
                    couleurStatut[p.statut_sante] || "bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className="text-xs">{statutIcone[p.statut_sante] || "⚪"}</span>
                  <span className="hidden sm:inline">{getStatutLabel(p.statut_sante)}</span>
                </span>
              )}
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
              <div className="flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>
                  Début : {p.date_debut
                    ? new Date(p.date_debut).toLocaleDateString("fr-FR")
                    : "—"}
                </span>
              </div>
              {p.date_fin_prevue && (
                <div className="flex items-center gap-1">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  <span>Fin : {new Date(p.date_fin_prevue).toLocaleDateString("fr-FR")}</span>
                </div>
              )}
            </div>

            {/* Barre de progression */}
            <div className="mt-3">
              <div className="mb-1 h-1.5 w-full overflow-hidden  bg-slate-100">
                <div
                  className={`h-full  transition-all duration-500 ${
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
              {p.archive ? (
                <>
                  <button
                    onClick={(e) => restaurer(p, e)}
                    title="Restaurer le projet"
                    className="p-1.5 text-slate-500 hover:text-[#63B23E] hover:bg-green-50  transition-colors"
                  >
                    <RestoreIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => supprimer(p, e)}
                    title="Supprimer définitivement"
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50  transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => chat(p, e)}
                    title="Accéder au chat du projet"
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50  transition-colors"
                  >
                    <ChatIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => archiver(p, e)}
                    title="Archiver le projet"
                    className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50  transition-colors"
                  >
                    <ArchiveIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => supprimer(p, e)}
                    title="Supprimer le projet"
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50  transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}