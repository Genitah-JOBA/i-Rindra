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
  Spin,
  IconCheck,
  IconX,
  IconUsers,
  IconRefresh,
  IconArrowRight,
} from "./Shared";

// Doit rester synchronisé avec MAX_SUGGESTIONS dans backend/app/services/ia.py.
// Sert uniquement à l'affichage du message « plafond atteint ».
const MAX_SUGGESTIONS = 15;

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
    <div className="mt-2 bg-slate-50 border border-slate-200 px-3 py-2">
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
              className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-[11px] px-2 py-0.5"
            >
              <span className="w-1.5 h-1.5 bg-green-500 flex-shrink-0" />
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
              className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[11px] px-2 py-0.5 line-through opacity-60"
            >
              <span className="w-1.5 h-1.5 bg-amber-400 flex-shrink-0" />
              {m.nom}
              <span className="text-amber-500">({m.taches_fenetre} tâches)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const PRIORITE = {
  haute: { libelle: "Haute", barre: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200", rang: 0 },
  moyenne: { libelle: "Moyenne", barre: "bg-orange-400", badge: "bg-orange-50 text-orange-700 border-orange-200", rang: 1 },
  basse: { libelle: "Basse", barre: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-700 border-yellow-200", rang: 2 },
};

// Tri : priorité haute d'abord, puis échéance la plus proche (sans date à la fin).
function trier(liste) {
  return [...liste].sort((a, b) => {
    const pa = PRIORITE[a.priorite]?.rang ?? 1;
    const pb = PRIORITE[b.priorite]?.rang ?? 1;
    if (pa !== pb) return pa - pb;
    const ea = toISO(a.echeance) || "9999-12-31";
    const eb = toISO(b.echeance) || "9999-12-31";
    return ea.localeCompare(eb);
  });
}

function IconCalendrier({ className = "w-3.5 h-3.5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

// Une suggestion (vue « suggérées » ou « rejetées »)
function SuggestionCarte({ suggestion: s, numero, membresDispo, onValider, onRejeter, onRestaurer }) {
  const [deplie, setDeplie] = useState(false);
  const prio = PRIORITE[s.priorite] || PRIORITE.moyenne;
  const longue = (s.description || "").length > 180;

  return (
    <div className={`relative flex border border-slate-200 bg-white shadow-sm ${s.statut === "rejetee" ? "opacity-75" : ""}`}>
      <span className={`w-1 flex-shrink-0 ${prio.barre}`} />
      <div className="min-w-0 flex-1 p-4">
        {/* En-tête : numéro, titre, méta-infos */}
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center bg-i-primary text-[11px] font-bold text-white">
            {numero}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold leading-snug text-i-primary">{s.titre}</h4>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`border px-2 py-0.5 font-semibold ${prio.badge}`}>Priorité {prio.libelle.toLowerCase()}</span>
              <span className="inline-flex items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                <IconCalendrier /> {s.echeance ? toFR(s.echeance) : "Sans échéance"}
              </span>
              {s.statut !== "en_attente" && (
                <span className={`px-2 py-0.5 ${STYLE_STATUT[s.statut]}`}>{LIBELLE_STATUT[s.statut]}</span>
              )}
            </div>
          </div>
        </div>

        {s.description && (
          <div className="mt-3 pl-9">
            <p className={`text-sm leading-relaxed text-slate-600 ${!deplie && longue ? "line-clamp-2" : ""}`}>
              {s.description}
            </p>
            {longue && (
              <button onClick={() => setDeplie((d) => !d)} className="mt-1 text-xs font-medium text-i-blue hover:underline">
                {deplie ? "Réduire" : "Voir plus"}
              </button>
            )}
          </div>
        )}

        {s.statut === "en_attente" && s.echeance && (
          <div className="pl-9">
            <DispoBadge membres={membresDispo} date={s.echeance} />
          </div>
        )}

        {/* Actions */}
        {s.statut === "en_attente" && (onValider || onRejeter) && (
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            {onRejeter && (
              <button
                onClick={() => onRejeter(s)}
                className="flex items-center gap-1 border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                <IconX /> Rejeter
              </button>
            )}
            {onValider && (
              <button
                onClick={() => onValider(s)}
                className="flex items-center gap-1 bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
              >
                <IconCheck /> Valider et créer la tâche
                <IconArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Réintégration : une tâche rejetée peut revenir dans la liste à valider. */}
        {s.statut === "rejetee" && onRestaurer && (
          <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
            <button
              onClick={() => onRestaurer(s)}
              title="Remettre cette tâche dans la liste « à valider »"
              className="flex items-center gap-1 border border-i-blue/40 bg-i-blue/5 px-3 py-1.5 text-xs font-semibold text-i-blue transition hover:bg-i-blue/10"
            >
              <IconRefresh /> Réintégrer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExtractionTab({ projets }) {
  const { showSuccess, showError, showConfirm } = useMessage();
  const [projetId, setProjetId] = useState(null);
  const [texte, setTexte] = useState("");
  const [generation, setGeneration] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [membres, setMembres] = useState([]);
  // `false` au départ : aucun chargement n'est réellement en cours tant que
  // l'utilisateur n'a pas choisi de projet. Avec `true`, ce composant étant
  // dépourvu de useEffect, le spinner restait bloqué indéfiniment à
  // l'ouverture de l'onglet (cf. `chargerSuggestions` / `changerProjet`).
  const [chargement, setChargement] = useState(false);
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
      const n = data.nombre_suggestions;
      const details = [];
      if (data.plafonne) {
        details.push(`plafond de ${MAX_SUGGESTIONS} tâches — affinez le CDC pour plus de précision`);
      }
      if (data.doublons_ignores > 0) {
        details.push(`${data.doublons_ignores} doublon(s) écarté(s), déjà suggéré(s)`);
      }
      showSuccess(
        `${n} tâche${n > 1 ? "s" : ""} proposée${n > 1 ? "s" : ""} par l'IA. À vous de valider !` +
          (details.length ? ` (${details.join(" · ")})` : ""),
      );
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
    const ok = await showConfirm({
      type: "success",
      title: "Valider la suggestion",
      message: `Créer la tâche « ${s.titre} » dans le Kanban du projet ?`,
      confirmLabel: "Valider",
      cancelLabel: "Annuler",
    });
    if (!ok) return;
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
    const ok = await showConfirm({
      type: "warning",
      title: "Rejeter la suggestion",
      message: `Rejeter la suggestion « ${s.titre} » ? Vous pourrez la réintégrer plus tard.`,
      confirmLabel: "Rejeter",
      cancelLabel: "Annuler",
    });
    if (!ok) return;
    try {
      await iaService.rejeterSuggestion(s.id);
      showSuccess("Suggestion rejetée.");
      await chargerSuggestions(projetId);
    } catch (err) {
      const msg = err.response?.data?.detail || "Rejet impossible.";
      showError(msg);
    }
  };

  const restaurer = async (s) => {
    try {
      await iaService.restaurerSuggestion(s.id);
      showSuccess(`Tâche « ${s.titre} » remise dans les suggestions à valider.`);
      await chargerSuggestions(projetId);
    } catch (err) {
      const msg = err.response?.data?.detail || "Réintégration impossible.";
      showError(msg);
    }
  };

  const suggestionsEnAttente = trier(suggestions.filter((s) => s.statut === "en_attente"));
  const suggestionsRejetees = trier(suggestions.filter((s) => s.statut === "rejetee"));
  const nbHautes = suggestionsEnAttente.filter((s) => s.priorite === "haute").length;

  return (
    <div className="h-full overflow-y-auto space-y-4 animate__animated animate__fadeIn">
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
              className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue rounded-none"
            />
          </div>
          <BtnIA onClick={extraire} loading={generation} className="text-black">
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
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {suggestionsEnAttente.length} tâche{suggestionsEnAttente.length > 1 ? "s" : ""} à valider
              {nbHautes > 0 && <> · <span className="font-semibold text-red-600">{nbHautes} priorité haute</span></>}
              {" "}— classées par priorité puis par échéance.
            </p>
            {suggestionsEnAttente.map((s, i) => {
              const dateKey = toISO(s.echeance);
              return (
                <SuggestionCarte
                  key={s.id}
                  numero={i + 1}
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
          <div className="space-y-3">
            {suggestionsRejetees.map((s, i) => (
              <SuggestionCarte key={s.id} numero={i + 1} suggestion={s} onRestaurer={restaurer} />
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
