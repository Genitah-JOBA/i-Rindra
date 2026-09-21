// src/pages/AssistantIA/RechercheTab.jsx — RF-31 : recherche dans un projet.
import { useState } from "react";
import { iaService } from "../../api/ia";
import { useMessage } from "../../context/MessageContext";
import { Carte, SelectProjet, AlertErreur, TitreSection, Spin, IconList, IconChatBubble, IconFlag, IconDocumentText } from "./Shared";

const ICONE_TYPE = {
  tache: IconList,
  commentaire: IconChatBubble,
  jalon: IconFlag,
  fichier: IconDocumentText,
};

const LIBELLE_TYPE = {
  tache: "Tâche",
  commentaire: "Commentaire",
  jalon: "Jalon",
  fichier: "Fichier",
};

export default function RechercheTab({ projets }) {
  const { showError } = useMessage();
  const [projetId, setProjetId] = useState(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState("");

  const chercher = async (e) => {
    e.preventDefault();
    const requete = q.trim();
    if (!projetId) {
      const msg = "Sélectionnez un projet.";
      setErreur(msg);
      showError(msg);
      return;
    }
    if (!requete) {
      const msg = "Saisissez une recherche.";
      setErreur(msg);
      showError(msg);
      return;
    }
    setLoading(true);
    setErreur("");
    try {
      const data = await iaService.recherche(projetId, requete);
      setResultat(data);
    } catch (err) {
      const msg = err.response?.data?.detail || "Recherche impossible.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate__animated animate__fadeIn">
      <AlertErreur>{erreur}</AlertErreur>

      <Carte className="p-4">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_auto]" onSubmit={chercher}>
          <SelectProjet projets={projets} value={projetId} onChange={setProjetId} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Que cherchez-vous ? (ex : Livraison, bug, refonte)"
            className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue rounded-md"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 rounded-md"
          >
            {loading ? "Recherche…" : "Rechercher"}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          La recherche interroge tâches, commentaires, jalons et fichiers du projet.
        </p>
      </Carte>

      {loading && <Spin label="Recherche dans le projet…" />}

      {resultat && !loading && (
        <Carte className="p-5">
          <div className="mb-3">
            <TitreSection>Recherche « {resultat.requete} »</TitreSection>
            <p className="text-sm text-slate-500">
              {resultat.nombre_resultats} résultat{resultat.nombre_resultats === 1 ? "" : "s"}
            </p>
          </div>

          {resultat.nombre_resultats === 0 ? (
            <p className="text-sm text-slate-500">Aucun résultat. Essayez d'autres mots-clés.</p>
          ) : (
            <div className="space-y-2">
              {resultat.resultats.map((r) => (
                <div key={`${r.type}-${r.id}`} className="border border-slate-200 px-4 py-3 rounded-lg bg-slate-50/60">
                  <span className="text-sm flex items-start gap-2">
                    <span className="flex-shrink-0">
                      {(ICONE_TYPE[r.type] || IconDocumentText)({ className: "w-4 h-4 text-i-blue mt-0.5" })}
                    </span>
                    <span>
                      <span className="font-semibold">{r.titre}</span>
                      <span className="ml-2 text-[10px] font-semibold text-slate-400 uppercase">
                        {LIBELLE_TYPE[r.type] || r.type} #{r.id}
                      </span>
                      {r.extrait && <p className="mt-1 text-xs text-slate-500 italic">{r.extrait}</p>}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Carte>
      )}
    </div>
  );
}
