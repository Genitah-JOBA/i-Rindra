// src/pages/Taches/index.jsx — Kanban des tâches d'un projet (RF-11 à RF-15).
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { tachesService } from "../../api/taches";
import { projetsService } from "../../api/projets";

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

export default function Taches() {
  // Projet ciblé via l'URL, ex: /taches?projet=5 (depuis une fiche projet ou une notification)
  const [searchParams] = useSearchParams();
  const projetParam = searchParams.get("projet");

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

  // 1) Charger la liste des projets au montage (présélectionne le projet de l'URL si présent)
  useEffect(() => {
    projetsService
      .list()
      .then((data) => {
        setProjets(data || []);
        setProjetId((prev) => {
          if (prev) return prev;
          if (projetParam && (data || []).some((p) => String(p.id) === String(projetParam))) {
            return String(projetParam);
          }
          return data && data.length > 0 ? String(data[0].id) : "";
        });
      })
      .catch((err) =>
        setErreur(err.response?.data?.detail || "Erreur de chargement des projets.")
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Réagit si on arrive sur /taches?projet=X vers un autre projet (ex: clic sur une notification)
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
      setTaches(t || []);
      setMembres(m || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur de chargement des tâches.");
      setTaches([]);
    } finally {
      setLoading(false);
    }
  }, [projetId]);

  useEffect(() => {
    chargerTaches();
  }, [chargerTaches]);

  // Nom du responsable d'une tâche (résolu via les membres du projet)
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
      setForm({ titre: "", description: "", priorite: "moyenne", responsable_id: "", echeance: "" });
      await chargerTaches();
    } catch (err) {
      setFormErreur(err.response?.data?.detail || "Erreur lors de la création.");
    } finally {
      setCreation(false);
    }
  };

  // Déplacer une tâche vers un autre statut
  const deplacer = async (tache, nouveauStatut) => {
    try {
      await tachesService.changeStatut(tache.id, nouveauStatut);
      await chargerTaches();
    } catch (err) {
      alert(err.response?.data?.detail || "Impossible de déplacer la tâche.");
    }
  };

  const supprimer = async (tache) => {
    if (!window.confirm(`Supprimer la tâche « ${tache.titre} » ?`)) return;
    try {
      await tachesService.remove(tache.id);
      setTaches((prev) => prev.filter((t) => t.id !== tache.id));
    } catch (err) {
      alert(err.response?.data?.detail || "Erreur lors de la suppression.");
    }
  };

  const indexStatut = (s) => COLONNES.findIndex((c) => c.statut === s);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tâches — Kanban</h1>
          <p className="text-sm text-slate-500">
            Organisez les tâches du projet par statut.
          </p>
        </div>
        {/* Sélecteur de projet */}
        <select
          value={projetId}
          onChange={(e) => setProjetId(e.target.value)}
          className="border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
        >
          {projets.length === 0 && <option value="">Aucun projet</option>}
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
          className="mb-6 flex flex-col gap-3 border bg-white p-4 shadow-sm md:flex-row md:items-end"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Titre</label>
            <input
              type="text"
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              placeholder="Nouvelle tâche…"
              className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Priorité</label>
            <select
              value={form.priorite}
              onChange={(e) => setForm({ ...form, priorite: e.target.value })}
              className="border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
            >
              <option value="basse">Basse</option>
              <option value="moyenne">Moyenne</option>
              <option value="haute">Haute</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Responsable</label>
            <select
              value={form.responsable_id}
              onChange={(e) => setForm({ ...form, responsable_id: e.target.value })}
              className="border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
            >
              <option value="">— Aucun —</option>
              {membres.map((m) => (
                <option key={m.id} value={m.utilisateur_id}>
                  {m.prenom} {m.nom}
                  {m.metier ? ` — ${m.metier}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Échéance</label>
            <input
              type="date"
              value={form.echeance}
              onChange={(e) => setForm({ ...form, echeance: e.target.value })}
              className="border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
            />
          </div>
          <button
            type="submit"
            disabled={creation}
            className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56] disabled:opacity-50"
          >
            {creation ? "Ajout…" : " + Ajouter"}
          </button>
        </form>
      )}
      {formErreur && <p className="mb-4 text-sm text-red-600">{formErreur}</p>}

      {loading ? (
        <p className="text-slate-500">Chargement des tâches…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLONNES.map((col) => {
            const tachesCol = taches.filter((t) => t.statut === col.statut);
            return (
              <div key={col.statut} className="bg-slate-100 p-3">
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-700">
                  {col.label}
                  <span className="bg-white px-2 text-xs text-slate-500">
                    {tachesCol.length}
                  </span>
                </h2>

                <div className="space-y-3">
                  {tachesCol.map((t) => {
                    const idx = indexStatut(t.statut);
                    return (
                      <div key={t.id} className="border bg-white p-3 shadow-sm">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">{t.titre}</p>
                          <span
                            className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium ${
                              couleurPriorite[t.priorite] || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {t.priorite}
                          </span>
                        </div>
                        <p className="mb-2 text-xs text-slate-500">
                          {nomResponsable(t.responsable_id) || "Non assignée"}
                          {t.echeance && ` · ${t.echeance}`}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => deplacer(t, COLONNES[idx - 1].statut)}
                              className="border px-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                              title="Reculer"
                            >
                              ←
                            </button>
                            <button
                              disabled={idx === COLONNES.length - 1}
                              onClick={() => deplacer(t, COLONNES[idx + 1].statut)}
                              className="border px-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                              title="Avancer"
                            >
                              →
                            </button>
                          </div>
                          <button
                            onClick={() => supprimer(t)}
                            className="text-xs text-slate-400 hover:text-red-600"
                            title="Supprimer"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {tachesCol.length === 0 && (
                    <p className="text-center text-xs text-slate-400">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
