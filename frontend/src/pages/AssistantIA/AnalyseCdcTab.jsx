// src/pages/AssistantIA/AnalyseCdcTab.jsx — RF-25 : analyse du cahier des charges.
import { useState } from "react";
import { iaService } from "../../api/ia";
import { useMessage } from "../../context/MessageContext";
import { Carte, BtnIA, SelectProjet, AlertErreur, BadgeIA, TitreSection, PuceList, Spin } from "./Shared";

export default function AnalyseCdcTab({ projets }) {
  const { showSuccess, showError } = useMessage();
  const [projetId, setProjetId] = useState(null);
  const [texte, setTexte] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState("");

  const analyser = async () => {
    if (!projetId) {
      const msg = "Sélectionnez un projet.";
      setErreur(msg);
      showError(msg);
      return;
    }
    setLoading(true);
    setErreur("");
    setResultat(null);
    try {
      const data = await iaService.analyserCdc(projetId, texte.trim() || null);
      setResultat(data);
      showSuccess("Analyse du cahier des charges terminée.");
    } catch (err) {
      const msg = err.response?.data?.detail || "Analyse impossible.";
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
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Projet</label>
            <SelectProjet projets={projets} value={projetId} onChange={setProjetId} />
            <p className="mt-1 text-xs text-slate-400">
              L'IA lit le CDC joint (txt/md/csv) sinon la description du projet.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Texte du cahier des charges (optionnel)
            </label>
            <textarea
              rows={4}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Collez ici le contenu du CDC pour ignorer les fichiers du projet…"
              className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E] rounded-md"
            />
          </div>
          <BtnIA onClick={analyser} loading={loading}>
            Analyser le cahier des charges
          </BtnIA>
        </div>
      </Carte>

      {loading && <Spin label="L'IA analyse le cahier des charges…" />}

      {resultat && (
        <Carte className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Synthèse de l'analyse</h3>
            <BadgeIA modele={resultat.modele} />
          </div>

          <div className="mb-4">
            <TitreSection>Périmètre</TitreSection>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{resultat.perimetre}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="bg-purple-50 border border-purple-100 p-3 rounded-lg">
              <TitreSection className="text-purple-700">Points clés</TitreSection>
              <PuceList items={resultat.points_cles} />
            </div>
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg">
              <TitreSection className="text-rose-700">Risques</TitreSection>
              <PuceList items={resultat.risques} />
            </div>
          </div>

          <div className="mt-4 bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
            <TitreSection className="text-emerald-700">Recommandations</TitreSection>
            <PuceList items={resultat.recommandations} />
          </div>
        </Carte>
      )}
    </div>
  );
}