// src/pages/AssistantIA/AffectationTab.jsx — RF-30 : aide à l'affectation d'une tâche.
// L'IA classe les membres du projet, l'humain tranche et affecte effectivement.
import { useState } from "react";
import { iaService } from "../../api/ia";
import { tachesService } from "../../api/taches";
import { useMessage } from "../../context/MessageContext";
import { Carte, BtnIA, SelectProjet, SelectTache, AlertErreur, BadgeIA, Spin, IconChatBubble, IconInfo } from "./Shared";

export default function AffectationTab({ projets }) {
  const { showSuccess, showError } = useMessage();
  const [projetId, setProjetId] = useState(null);
  const [taches, setTaches] = useState([]);
  const [tacheId, setTacheId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [erreur, setErreur] = useState("");

  // Charger les tâches dès qu'un projet est choisi
  const changerProjet = (id) => {
    setProjetId(id);
    setTacheId(null);
    setSuggestions(null);
    if (!id) {
      setTaches([]);
      return;
    }
    tachesService
      .listByProjet(id)
      .then(setTaches)
      .catch((err) => showError(err.response?.data?.detail || "Erreur de chargement des tâches."));
  };

  const proposer = async () => {
    if (!tacheId) {
      const msg = "Sélectionnez d'abord une tâche.";
      setErreur(msg);
      showError(msg);
      return;
    }
    setLoading(true);
    setErreur("");
    setSuggestions(null);
    try {
      const data = await iaService.affectation(tacheId);
      setSuggestions(data);
      showSuccess("Classement des membres établi par l'IA.");
    } catch (err) {
      const msg = err.response?.data?.detail || "Propositions d'affectation impossibles.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const affecter = async (userId, nom) => {
    if (!window.confirm(`Affecter définitivement la tâche à ${nom} ?`)) return;
    try {
      await tachesService.affecter(tacheId, userId);
      showSuccess(`Tâche affectée à ${nom}.`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Affectation impossible.";
      showError(msg);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 animate__animated animate__fadeIn">
      <AlertErreur>{erreur}</AlertErreur>

      <Carte className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Projet</label>
            <SelectProjet projets={projets} value={projetId} onChange={changerProjet} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tâche</label>
            <SelectTache taches={taches} value={tacheId} onChange={setTacheId} disabled={!projetId} />
          </div>
        </div>
        <div className="mt-3">
          <BtnIA onClick={proposer} loading={loading}>
            Classer les membres par l'IA
          </BtnIA>
        </div>
      </Carte>

      {loading && <Spin label="L'IA classe les profils…" />}

      {suggestions && (
        <Carte className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">
              Membres recommandés <span className="text-slate-400 font-normal">pour « {suggestions.tache_titre} »</span>
            </h3>
            <BadgeIA modele={suggestions.modele} />
          </div>

          {suggestions.suggestions.length === 0 ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg">
              L'IA n'a trouvé aucun membre pertinent pour cette tâche.
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.suggestions.map((s, idx) => (
                <div key={s.utilisateur_id} className="flex flex-col md:flex-row md:items-center gap-3 border border-slate-200 px-4 py-3 rounded-lg bg-slate-50/60">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-i-blue/10 text-i-blue text-xs font-bold flex-shrink-0">
                      #{idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{s.nom}</p>
                      <p className="text-xs text-slate-400">{s.metier || "Métier non renseigné"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-i-blue">{s.score} pts</span>
                    <div className="w-28 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-gradient rounded-full"
                        style={{ width: `${Math.min(s.score, 100)}%` }}
                      />
                    </div>
                    <button
                      onClick={() => affecter(s.utilisateur_id, s.nom)}
                      className="bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 rounded-md flex-shrink-0"
                    >
                      Affecter
                    </button>
                  </div>
                  {s.justification && (
                    <p className="md:col-span-3 flex items-start gap-1.5 text-xs text-slate-500">
                      <IconChatBubble className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="italic">{s.justification}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {suggestions.note && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
              <IconInfo className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="italic">{suggestions.note}</span>
            </p>
          )}
        </Carte>
      )}
    </div>
  );
}
