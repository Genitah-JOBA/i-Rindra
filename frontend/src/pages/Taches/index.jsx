// src/pages/Taches/index.jsx — Kanban des tâches d'un projet (RF-11 à RF-15).
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { tachesService } from "../../api/taches";
import { projetsService } from "../../api/projets";
import { useLang } from "../../i18n/LangContext";
import { useMessage } from "../../context/MessageContext";
import TaskDetailModal from "../../components/TaskDetailModal";
import 'animate.css';

// Les 4 colonnes du Kanban = les statuts du backend
const COLONNES = [
  { statut: "a_faire", label: "À faire" },
  { statut: "en_cours", label: "En cours" },
  { statut: "en_revue", label: "En revue" },
  { statut: "termine", label: "Terminé" },
];

const couleurPriorite = {
  basse: "bg-slate-100 text-slate-600",
  moyenne: "bg-yellow-100 text-yellow-700",
  haute: "bg-orange-100 text-orange-700",
};

const labelPriorite = {
  basse: "Basse",
  moyenne: "Moyenne",
  haute: "Haute",
};

export default function Taches() {
  const [searchParams] = useSearchParams();
  const projetParam = searchParams.get("projet");
  const { t: tr } = useLang();
  const { showSuccess, showError } = useMessage();

  const [projets, setProjets] = useState([]);
  const [projetId, setProjetId] = useState("");
  const [membres, setMembres] = useState([]);
  const [taches, setTaches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");

  // Formulaire de création
  const [form, setForm] = useState({
    titre: "",
    description: "",
    priorite: "moyenne",
    responsable_id: "",
    echeance: "",
  });
  const [creation, setCreation] = useState(false);
  const [formErreur, setFormErreur] = useState("");

  // Tâche sélectionnée pour le détail / commentaires (RF-14)
  const [tacheActive, setTacheActive] = useState(null);

  // 1) Charger la liste des projets au montage
  useEffect(() => {
    projetsService
      .list()
      .then((data) => {
        setProjets(data || []);
        setProjetId((prev) => {
          if (prev) return prev;
          if (
            projetParam &&
            (data || []).some((p) => String(p.id) === String(projetParam))
          ) {
            return String(projetParam);
          }
          return data && data.length > 0 ? String(data[0].id) : "";
        });
      })
      .catch((err) =>
        setErreur(
          err.response?.data?.detail || "Erreur de chargement des projets.",
        ),
      );
  }, []);

  // Réagit si on arrive sur /taches?projet=X
  useEffect(() => {
    if (projetParam) setProjetId(String(projetParam));
  }, [projetParam]);

  // 2) Charger tâches + membres quand le projet change
  const chargerTaches = useCallback(async () => {
    if (!projetId) return;
    setLoading(true);
    setErreur("");
    try {
      const [t, m] = await Promise.all([
        tachesService.listByProjet(projetId),
        projetsService.getMembres(projetId).catch(() => []),
      ]);
      
      // Ajouter le nombre de commentaires à chaque tâche
      const tachesAvecCommentaires = await Promise.all(
        (t || []).map(async (tache) => {
          try {
            const commentaires = await tachesService.listCommentaires(tache.id);
            return {
              ...tache,
              nombre_commentaires: commentaires?.length || 0,
            };
          } catch {
            return { ...tache, nombre_commentaires: 0 };
          }
        })
      );
      
      setTaches(tachesAvecCommentaires);
      setMembres(m || []);
    } catch (err) {
      setErreur(
        err.response?.data?.detail || "Erreur de chargement des tâches.",
      );
      setTaches([]);
    } finally {
      setLoading(false);
    }
  }, [projetId]);

  useEffect(() => {
    chargerTaches();
  }, [chargerTaches]);

  // Nom du responsable d'une tâche
  const nomResponsable = (responsableId) => {
    if (!responsableId) return null;
    const m = membres.find((x) => x.utilisateur_id === responsableId);
    if (!m) return `#${responsableId}`;
    return `${m.prenom} ${m.nom}${m.metier ? ` (${m.metier})` : ""}`;
  };

  const creerTache = async (e) => {
    e.preventDefault();
    setFormErreur("");
    if (!form.titre.trim()) {
      setFormErreur("Le titre est requis.");
      return;
    }
    setCreation(true);
    try {
      await tachesService.create(projetId, {
        projet_id: parseInt(projetId, 10),
        titre: form.titre,
        description: form.description || null,
        priorite: form.priorite,
        statut: "a_faire",
        responsable_id: form.responsable_id
          ? parseInt(form.responsable_id, 10)
          : null,
        echeance: form.echeance || null,
      });
      showSuccess("Tâche créée avec succès !");
      setForm({
        titre: "",
        description: "",
        priorite: "moyenne",
        responsable_id: "",
        echeance: "",
      });
      await chargerTaches();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de la création.";
      setFormErreur(msg);
      showError(msg);
    } finally {
      setCreation(false);
    }
  };

  // Déplacer une tâche vers un autre statut
  const deplacer = async (tache, nouveauStatut) => {
    try {
      await tachesService.changeStatut(tache.id, nouveauStatut);
      showSuccess(`Tâche déplacée vers "${tr("kanban." + nouveauStatut)}"`);
      await chargerTaches();
    } catch (err) {
      const msg = err.response?.data?.detail || "Impossible de déplacer la tâche.";
      showError(msg);
    }
  };

  const supprimer = async (tache) => {
    if (!window.confirm(`Supprimer la tâche « ${tache.titre} » ?`)) return;
    try {
      await tachesService.remove(tache.id);
      setTaches((prev) => prev.filter((t) => t.id !== tache.id));
      showSuccess(`Tâche "${tache.titre}" supprimée.`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de la suppression.";
      showError(msg);
    }
  };

  // Mise à jour du nombre de commentaires après ajout
  const handleCommentaireAjoute = (tacheId) => {
    setTaches((prev) =>
      prev.map((t) =>
        t.id === tacheId
          ? { ...t, nombre_commentaires: (t.nombre_commentaires || 0) + 1 }
          : t,
      ),
    );
  };

  const indexStatut = (s) => COLONNES.findIndex((c) => c.statut === s);

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {tr("taches.titre")}
          </h1>
          <p className="text-sm text-slate-500">{tr("taches.sousTitre")}</p>
        </div>
        <select
          value={projetId}
          onChange={(e) => setProjetId(e.target.value)}
          className="border border-slate-300  px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
        >
          {projets.length === 0 && (
            <option value="">{tr("taches.aucunProjet")}</option>
          )}
          {projets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      </div>

      {erreur && <p className="mb-4 text-red-600">{erreur}</p>}

      {/* Formulaire de création */}
      {projetId && (
        <form
          onSubmit={creerTache}
          className="mb-6 flex flex-col gap-3 border border-slate-200 bg-white p-4 shadow-sm  md:flex-row md:items-end"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {tr("taches.form.titre")}
            </label>
            <input
              type="text"
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              placeholder={tr("taches.form.placeholder")}
              className="w-full border border-slate-300  px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {tr("taches.form.priorite")}
            </label>
            <select
              value={form.priorite}
              onChange={(e) => setForm({ ...form, priorite: e.target.value })}
              className="border border-slate-300  px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
            >
              <option value="basse">{tr("priorite.basse")}</option>
              <option value="moyenne">{tr("priorite.moyenne")}</option>
              <option value="haute">{tr("priorite.haute")}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {tr("taches.form.responsable")}
            </label>
            <select
              value={form.responsable_id}
              onChange={(e) =>
                setForm({ ...form, responsable_id: e.target.value })
              }
              className="border border-slate-300  px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
            >
              <option value="">{tr("common.aucun")}</option>
              {membres.map((m) => (
                <option key={m.id} value={m.utilisateur_id}>
                  {m.prenom} {m.nom}
                  {m.metier ? ` — ${m.metier}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {tr("taches.form.echeance")}
            </label>
            <input
              type="date"
              value={form.echeance}
              onChange={(e) => setForm({ ...form, echeance: e.target.value })}
              className="border border-slate-300  px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={creation}
            className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white  transition hover:bg-[#4a8f2e] disabled:opacity-50"
          >
            {creation
              ? tr("common.enregistrement")
              : "+ " + tr("common.ajouter")}
          </button>
        </form>
      )}
      {formErreur && <p className="mb-4 text-sm text-red-600">{formErreur}</p>}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin  h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">{tr("common.chargement")}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLONNES.map((col) => {
            const tachesCol = taches.filter((t) => t.statut === col.statut);
            return (
              <div key={col.statut} className="bg-slate-50  p-3">
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-700">
                  {tr("kanban." + col.statut)}
                  <span className="bg-white px-2 py-0.5 text-xs text-slate-500 ">
                    {tachesCol.length}
                  </span>
                </h2>

                <div className="space-y-3">
                  {tachesCol.map((t) => {
                    const idx = indexStatut(t.statut);
                    return (
                      <div
                        key={t.id}
                        className="cursor-pointer border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md hover:border-[#63B23E]  transition-all duration-200"
                        onClick={() => setTacheActive(t)}
                        title={tr("taches.ouvrirDetail")}
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {t.titre}
                          </p>
                          <span
                            className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium  ${
                              couleurPriorite[t.priorite] ||
                              "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {labelPriorite[t.priorite] || t.priorite}
                          </span>
                        </div>
                        <p className="mb-2 text-xs text-slate-500">
                          {nomResponsable(t.responsable_id) ||
                            tr("taches.nonAssignee")}
                          {t.echeance && ` · ${t.echeance}`}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <button
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                deplacer(t, COLONNES[idx - 1].statut);
                              }}
                              className="border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                              title="Reculer"
                            >
                              ←
                            </button>
                            <button
                              disabled={idx === COLONNES.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                deplacer(t, COLONNES[idx + 1].statut);
                              }}
                              className="border border-slate-300 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                              title="Avancer"
                            >
                              →
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTacheActive(t);
                              }}
                              className="flex items-center gap-1 px-2 text-[11px] text-slate-500 hover:text-[#63B23E]"
                              title={tr("taches.ouvrirDetail")}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="h-3.5 w-3.5"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                                />
                              </svg>
                              {t.nombre_commentaires || 0}
                            </button>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              supprimer(t);
                            }}
                            className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                            title="Supprimer"
                          >
                            {tr("common.supprimer")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {tachesCol.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-4">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modale détail tâche + commentaires (RF-14) */}
      {tacheActive && (
        <TaskDetailModal
          key={tacheActive.id}
          tache={tacheActive}
          membres={membres}
          onClose={() => setTacheActive(null)}
          onCommentaireAjoute={() => handleCommentaireAjoute(tacheActive.id)}
        />
      )}
    </div>
  );
}