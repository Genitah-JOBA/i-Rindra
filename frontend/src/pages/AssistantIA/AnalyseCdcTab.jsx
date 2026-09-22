// src/pages/AssistantIA/AnalyseCdcTab.jsx — RF-25 : analyse du cahier des charges.
// L'utilisateur importe un fichier (.doc, .docx, .pdf, .png, .jpg) — le texte est
// extrait automatiquement côté backend (OCR pour les images).
import { useRef, useState } from "react";
import { iaService } from "../../api/ia";
import { useMessage } from "../../context/MessageContext";
import { Carte, BtnIA, SelectProjet, AlertErreur, BadgeIA, TitreSection, PuceList, Spin } from "./Shared";

const FORMATS_ACCEPTES = ".doc,.docx,.pdf,.png,.jpg,.jpeg,.txt,.md,.csv";
const TAILLE_MAX = 15 * 1024 * 1024; // 15 Mo, cohérent avec le backend

function IconDocument({ className = "w-5 h-5" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconCroix({ className = "w-4 h-4" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function tailleLisible(octets) {
  if (!octets) return "";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AnalyseCdcTab({ projets }) {
  const { showSuccess, showError } = useMessage();
  const [projetId, setProjetId] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState("");
  const inputRef = useRef(null);

  const surFichier = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setErreur("");
    setResultat(null);
    if (!f) return;
    if (f.size > TAILLE_MAX) {
      const msg = "Fichier trop volumineux (maximum 15 Mo).";
      setErreur(msg);
      showError(msg);
      return;
    }
    setFichier(f);
  };

  const analyser = async () => {
    if (!projetId) {
      const msg = "Sélectionnez un projet.";
      setErreur(msg);
      showError(msg);
      return;
    }
    if (!fichier) {
      const msg = "Choisissez un fichier à analyser.";
      setErreur(msg);
      showError(msg);
      return;
    }
    setLoading(true);
    setErreur("");
    setResultat(null);
    try {
      const data = await iaService.analyserCdc(projetId, { fichier });
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
    <div className="h-full overflow-y-auto space-y-4 animate__animated animate__fadeIn">
      <AlertErreur>{erreur}</AlertErreur>

      <Carte className="p-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Projet</label>
            <SelectProjet projets={projets} value={projetId} onChange={setProjetId} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Cahier des charges à analyser
            </label>

            {!fichier ? (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-i-blue hover:bg-green-50/40 transition-colors bg-slate-50 px-4 py-8 rounded-md"
              >
                <span className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500">
                  <IconDocument className="w-5 h-5" />
                </span>
                <span className="text-sm font-medium text-slate-600">
                  Cliquez pour importer un CDC
                </span>
                <span className="text-xs text-slate-400">
                  Formats : .doc, .docx, .pdf, .png, .jpg (max 15 Mo)
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-3 border border-slate-300 bg-green-50/50 px-4 py-3 rounded-md">
                <IconDocument className="w-6 h-6 text-i-blue flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{fichier.name}</p>
                  <p className="text-xs text-slate-500">
                    {tailleLisible(fichier.size)} · prêt à analyser
                  </p>
                </div>
                <button
                  onClick={() => setFichier(null)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
                  title="Retirer le fichier"
                >
                  <IconCroix />
                </button>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept={FORMATS_ACCEPTES}
              onChange={surFichier}
              className="hidden"
            />
            <p className="mt-1 text-xs text-slate-400">
              Les fichiers .png / .jpg sont transcrits automatiquement (OCR) par l'IA avant l'analyse.
            </p>
          </div>

          <BtnIA onClick={analyser} loading={loading} disabled={!fichier}>
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
            <div className="bg-i-blue/5 border border-i-blue/10 p-3 rounded-lg">
              <TitreSection className="text-i-blue">Points clés</TitreSection>
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
