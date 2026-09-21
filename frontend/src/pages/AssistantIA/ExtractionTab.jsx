// src/pages/AssistantIA/ExtractionTab.jsx — RF-26 : tâches suggérées par l'IA,
// avec validation / rejet (« l'IA propose, l'humain valide »)
// et affichage des membres disponibles pour chaque échéance.
import { useState } from "react";
import { iaService } from "../../api/ia";
import { projetsService } from "../../api/projets";
import { useMessage } from "../../context/MessageContext";
import {
  Carte,
  BtnIA,
  SelectProjet,
  AlertErreur,
  BadgeIA,
  Spin,
  IconCheck,
  IconX,
  IconUsers,
  IconRefresh,
  IconArrowRight,
} from "./Shared";

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
              {m.metier && <span className="text-green-600"> · {m.metier}</span>}
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

// Carte d'une suggestion (section « suggérées » ou « rejetées »)
function SuggestionCarte({ suggestion: s, membresDispo, onValider, onRejeter }) {
  return (
    <Carte className="p-4 flex flex-col gap-2">
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

      {s.statut === "en_attente" && (onValider || onRejeter) && (
        <div className="mt-auto flex items-center gap-2 pt-2 border-t border-slate-100">
          {onRejeter && (
            <button
              onClick={() => onRejeter(s)}
              className="flex items-center gap-1 border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 rounded-md"
            >
              <IconX /> Rejeter
            </button>
          )}
          {onValider && (
            <button
              onClick={() => onValider(s)}
              className="flex items-center gap-1 bg-brand-gradient px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110 rounded-md ml-auto"
            >
              <IconCheck /> Valider
              <IconArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </Carte>
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
  const [vueStatut, setVueStatut] = useState("suggerees");
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

  const suggestionsEnAttente = suggestions.filter((s) => s.statut === "en_attente");
  const suggestionsRejetees = suggestions.filter((s) => s.statut === "rejetee");

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
              className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue rounded-md"
            />
          </div>
          <BtnIA onClick={extraire} loading={generation}>
            Extraire les tâches par IA
          </BtnIA>
        </div>
      </Carte>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Sélecteur Tâches suggérées / Tâches rejetées */}
        <div className="inline-flex items-center gap-1 border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: "suggerees", label: "Tâches suggérées", count: suggestionsEnAttente.length, actif: "bg-amber-100 text-amber-700" },
            { id: "rejetees", label: "Tâches rejetées", count: suggestionsRejetees.length, actif: "bg-red-100 text-red-700" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setVueStatut(t.id)}
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                vueStatut === t.id ? t.actif : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <button
            onClick={async () => {
              await chargerSuggestions(projetId);
              const fresh = await iaService.listerSuggestions({ projet_id: projetId, statut: "en_attente" });
              await chargerDisponibilites(fresh || [], projetId);
            }}
            disabled={!projetId}
            className="flex items-center gap-1 text-xs font-medium text-i-blue hover:text-[#2e5d1f] disabled:text-slate-300"
          >
            <IconRefresh className="w-3.5 h-3.5" /> Actualiser
          </button>
      </div>

      {chargement && <Spin label="Chargement des suggestions…" />}

      {!chargement && vueStatut === "suggerees" && (
        suggestionsEnAttente.length === 0 ? (
          <Carte className="p-8 text-center">
            <p className="text-sm text-slate-500">
              {projetId
                ? "Aucune tâche suggérée. Lancez « Extraire les tâches par IA »."
                : "Sélectionnez un projet pour voir ses suggestions."}
            </p>
          </Carte>
        ) : (
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            {suggestionsEnAttente.map((s) => {
              const dateKey = toISO(s.echeance);
              return (
                <SuggestionCarte
                  key={s.id}
                  suggestion={s}
                  membresDispo={dateKey ? dispos[dateKey] : null}
                  onValider={valider}
                  onRejeter={rejeter}
                />
              );
            })}
          </div>
        )
      )}

      {!chargement && vueStatut === "rejetees" && (
        suggestionsRejetees.length === 0 ? (
          <Carte className="p-8 text-center">
            <p className="text-sm text-slate-500">{"Aucune tâche rejetée."}</p>
          </Carte>
        ) : (
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            {suggestionsRejetees.map((s) => (
              <SuggestionCarte key={s.id} suggestion={s} />
            ))}
          </div>
        )
      )}

      {membres.length > 0 && (
        <p className="text-xs text-slate-400">
          {membres.length} membre(s) dans l'équipe du projet — utilisez « Affectation » pour proposer le bon responsable.
        </p>
      )}
    </div>
  );
}
