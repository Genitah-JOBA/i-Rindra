// src/pages/AssistantIA/ExtractionTab.jsx — RF-26 : tâches suggérées par l'IA,
// avec validation / rejet (« l'IA propose, l'humain valide »)
// et affichage des membres disponibles pour chaque échéance.
import { useState } from "react";
import { iaService } from "../../api/ia";
import { projetsService } from "../../api/projets";
import { useMessage } from "../../context/MessageContext";
import { Carte, BtnIA, SelectProjet, AlertErreur, BadgeIA, Spin } from "./Shared";

const LIBELLE_STATUT = {
  en_attente: "À valider",
  validee: "Validé",
  rejetee: "Rejeté",
};
const STYLE_STATUT = {
  en_attente: "bg-amber-100 text-amber-700",
  validee: "bg-green-100 text-green-700",
  rejetee: "bg-red-100 text-red-700",
};

function IconCheck({ className = "w-3.5 h-3.5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconX({ className = "w-3.5 h-3.5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconUsers({ className = "w-3.5 h-3.5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

// Convertit YYYY-MM-DD ou objet date en string YYYY-MM-DD pour l'API
function toISO(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr === "string") return dateStr.slice(0, 10);
  return new Date(dateStr).toISOString().slice(0, 10);
}

function toFR(dateStr) {
  if (!dateStr) return "—";
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Composant mini pour afficher les membres disponibles autour d'une échéance
function DispoBadge({ membres, date }) {
  if (!membres || membres.length === 0) return null;
  const dispos = membres.filter((m) => m.disponible);
  const occupes = membres.filter((m) => !m.disponible);

  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <IconUsers className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Équipe libre le {toFR(date)}
        </span>
      </div>

      {dispos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dispos.map((m) => (
            <span
              key={m.utilisateur_id}
              className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-[11px] px-2 py-0.5 rounded-full"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              {m.nom}
              {m.metier && <span className="text-green-600">· {m.metier}</span>}
            </span>
          ))}
        </div>
      )}

      {occupes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {occupes.map((m) => (
            <span
              key={m.utilisateur_id}
              className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] px-2 py-0.5 rounded-full line-through opacity-60"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              {m.nom}
              <span className="text-amber-500">({m.taches_fenetre} tâches)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExtractionTab({ projets }) {
  const { showSuccess, showError } = useMessage();
  const [projetId, setProjetId] = useState(null);
  const [texte, setTexte] = useState("");
  const [generation, setGeneration] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [membres, setMembres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  // Map { "YYYY-MM-DD": MembreDisponibilite[] }
  const [dispos, setDispos] = useState({});

  const chargerSuggestions = async (pid) => {
    setChargement(true);
    setErreur("");
    try {
      const data = await iaService.listerSuggestions({ projet_id: pid || undefined, statut: "tous" });
      setSuggestions(data || []);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement des suggestions.";
      setErreur(msg);
      showError(msg);
    } finally {
      setChargement(false);
    }
  };

  // Récupère les disponibilités pour chaque échéance unique
  const chargerDisponibilites = async (suggestionsListe, pid) => {
    if (!pid || !suggestionsListe.length) {
      setDispos({});
      return;
    }
    const datesUniques = [
      ...new Set(suggestionsListe.map((s) => toISO(s.echeance)).filter(Boolean)),
    ];
    if (!datesUniques.length) {
      setDispos({});
      return;
    }
    try {
      const resultats = await Promise.all(
        datesUniques.map((d) => iaService.disponibilites(pid, d)),
      );
      const map = {};
      datesUniques.forEach((d, i) => {
        map[d] = resultats[i];
      });
      setDispos(map);
    } catch {
      // Silencieux : les disponibilités sont un ajout optionnel
    }
  };

  const changerProjet = (id) => {
    setProjetId(id);
    setSuggestions([]);
    setMembres([]);
    setDispos({});
    setErreur("");
    if (!id) {
      setChargement(false);
      return;
    }
    setChargement(true);
    iaService
      .listerSuggestions({ projet_id: id, statut: "tous" })
      .then((data) => {
        setSuggestions(data || []);
        return chargerDisponibilites(data || [], id);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || "Erreur de chargement des suggestions.";
        setErreur(msg);
        showError(msg);
      })
      .finally(() => setChargement(false));
    projetsService
      .getMembres(id)
      .then(setMembres)
      .catch(() => setMembres([]));
  };

  const extraire = async () => {
    if (!projetId) {
      const msg = "Sélectionnez un projet.";
      setErreur(msg);
      showError(msg);
      return;
    }
    setGeneration(true);
    setErreur("");
    try {
      const data = await iaService.extraireTaches(projetId, texte.trim() || null);
      showSuccess(`${data.nombre_suggestions} tâches proposées par l'IA. À vous de valider !`);
      await chargerSuggestions(projetId);
      // Charger les dispo pour les nouvelles suggestions
      const fresh = await iaService.listerSuggestions({ projet_id: projetId, statut: "en_attente" });
      await chargerDisponibilites(fresh || [], projetId);
    } catch (err) {
      const msg = err.response?.data?.detail || "Extraction impossible.";
      setErreur(msg);
      showError(msg);
    } finally {
      setGeneration(false);
    }
  };

  const valider = async (s) => {
    try {
      await iaService.validerSuggestion(s.id);
      showSuccess(`Tâche « ${s.titre} » créée dans le Kanban !`);
      await chargerSuggestions(projetId);
    } catch (err) {
      const msg = err.response?.data?.detail || "Validation impossible.";
      showError(msg);
    }
  };

  const rejeter = async (s) => {
    if (!window.confirm(`Rejeter la suggestion « ${s.titre} » ?`)) return;
    try {
      await iaService.rejeterSuggestion(s.id);
      showSuccess("Suggestion rejetée.");
      await chargerSuggestions(projetId);
    } catch (err) {
      const msg = err.response?.data?.detail || "Rejet impossible.";
      showError(msg);
    }
  };

  return (
    <div className="space-y-4 animate__animated animate__fadeIn">
      <AlertErreur>{erreur}</AlertErreur>

      <Carte className="p-4">
        <div className="grid grid-cols-1 gap-3">
          <SelectProjet projets={projets} value={projetId} onChange={changerProjet} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Texte à découper (optionnel — sinon CDC / description)
            </label>
            <textarea
              rows={3}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Collez ici un contenu précis à découper en tâches…"
              className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E] rounded-md"
            />
          </div>
          <BtnIA onClick={extraire} loading={generation}>
            Extraire les tâches par IA
          </BtnIA>
        </div>
      </Carte>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Suggestions de tâches</h3>
        <button
          onClick={async () => {
            await chargerSuggestions(projetId);
            const fresh = await iaService.listerSuggestions({ projet_id: projetId, statut: "en_attente" });
            await chargerDisponibilites(fresh || [], projetId);
          }}
          disabled={!projetId}
          className="text-xs font-medium text-purple-700 hover:text-purple-900 disabled:text-slate-300"
        >
          ↻ Actualiser
        </button>
      </div>

      {chargement && <Spin label="Chargement des suggestions…" />}

      {!chargement && suggestions.length === 0 && (
        <Carte className="p-8 text-center">
          <p className="text-sm text-slate-500">
            {projetId
              ? "Aucune suggestion. Lancez « Extraire les tâches par IA »."
              : "Sélectionnez un projet pour voir ses suggestions."}
          </p>
        </Carte>
      )}

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        {suggestions.map((s) => {
          const dateKey = toISO(s.echeance);
          const membresDispo = dateKey ? dispos[dateKey] : null;
          return (
            <Carte key={s.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-900">{s.titre}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STYLE_STATUT[s.statut] || STYLE_STATUT.en_attente}`}>
                      {LIBELLE_STATUT[s.statut] || LIBELLE_STATUT.en_attente}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Priorité {s.priorite} · Échéance {toFR(s.echeance)}
                  </p>
                </div>
                <BadgeIA modele={null} />
              </div>

              {s.description && (
                <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-3">{s.description}</p>
              )}

              {s.statut === "en_attente" && s.echeance && (
                <DispoBadge membres={membresDispo} date={s.echeance} />
              )}

              {s.statut === "en_attente" && (
                <div className="mt-auto flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => rejeter(s)}
                    className="flex items-center gap-1 border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 rounded-md"
                  >
                    <IconX /> Rejeter
                  </button>
                  <button
                    onClick={() => valider(s)}
                    className="flex items-center gap-1 bg-[#63B23E] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#4a8f2e] rounded-md ml-auto"
                  >
                    <IconCheck /> Valider → Tâche
                  </button>
                </div>
              )}
              {s.statut !== "en_attente" && s.tache_id && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-md">
                  ✓ Devenue la tâche #{s.tache_id} (Kanban).
                </p>
              )}
            </Carte>
          );
        })}
      </div>

      {membres.length > 0 && (
        <p className="text-xs text-slate-400">
          {membres.length} membre(s) dans l'équipe du projet — utilisez « Affectation » pour proposer le bon responsable.
        </p>
      )}
    </div>
  );
}