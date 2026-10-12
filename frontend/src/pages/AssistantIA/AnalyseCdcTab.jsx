// src/pages/AssistantIA/AnalyseCdcTab.jsx — RF-25 : analyse du cahier des charges.
// Source analysée : le fichier importé ici (.doc, .docx, .pdf, .png, .jpg — OCR
// pour les images) ou, à défaut, le cahier des charges déjà joint au projet.
// La dernière analyse du projet est réaffichée quand on le sélectionne.
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { iaService } from "../../api/ia";
import { useMessage } from "../../context/MessageContext";
import { Carte, BtnIA, SelectProjet, AlertErreur, BadgeIA, TitreSection, PuceList, Spin } from "./Shared";
import ReponseIA from "../../components/ReponseIA";

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

function dateHeure(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function AnalyseCdcTab({ projets }) {
  const { showSuccess, showError } = useMessage();
  const [projetId, setProjetId] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [analyseLe, setAnalyseLe] = useState(null);
  // { cdc_disponible, cdc_nom } du projet sélectionné ; null = pas encore connu
  const [infoCdc, setInfoCdc] = useState(null);
  const [chargementInfo, setChargementInfo] = useState(false);
  const [erreur, setErreur] = useState("");
  const inputRef = useRef(null);
  const requete = useRef(0); // ignore les réponses d'un projet qui n'est plus sélectionné

  // Changement de projet : on efface l'analyse affichée puis on recharge
  // celle du nouveau projet (si elle existe) et la présence de son CDC.
  const choisirProjet = async (id) => {
    const n = ++requete.current;
    setProjetId(id);
    setResultat(null);
    setAnalyseLe(null);
    setInfoCdc(null);
    setFichier(null);
    setErreur("");
    if (!id) return;
    setChargementInfo(true);
    try {
      const info = await iaService.derniereAnalyseCdc(id);
      if (n !== requete.current) return;
      setInfoCdc(info);
      setResultat(info.analyse);
      setAnalyseLe(info.analyse_le);
    } catch {
      if (n === requete.current) setInfoCdc({ cdc_disponible: false, cdc_nom: null });
    } finally {
      if (n === requete.current) setChargementInfo(false);
    }
  };

  const surFichier = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setErreur("");
    if (!f) return;
    if (f.size > TAILLE_MAX) {
      const msg = "Fichier trop volumineux (maximum 15 Mo).";
      setErreur(msg);
      showError(msg);
      return;
    }
    setFichier(f);
  };

  const cdcDuProjet = infoCdc?.cdc_disponible === true;
  const peutAnalyser = Boolean(projetId) && (Boolean(fichier) || cdcDuProjet);

  const analyser = async () => {
    if (!projetId) {
      const msg = "Sélectionnez un projet.";
      setErreur(msg);
      showError(msg);
      return;
    }
    if (!peutAnalyser) {
      const msg = "Ce projet n'a pas de cahier des charges : importez-en un.";
      setErreur(msg);
      showError(msg);
      return;
    }
    const n = requete.current;
    setLoading(true);
    setErreur("");
    try {
      const data = await iaService.analyserCdc(projetId, fichier ? { fichier } : {});
      if (n !== requete.current) return;
      setResultat(data);
      setAnalyseLe(new Date().toISOString());
      setFichier(null);
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
            <SelectProjet projets={projets} value={projetId} onChange={choisirProjet} />
          </div>

          {projetId && !chargementInfo && infoCdc && (
            cdcDuProjet ? (
              <div className="flex items-start gap-2 border border-i-blue/30 bg-i-blue/5 px-4 py-3 text-sm text-slate-700">
                <IconDocument className="mt-0.5 h-4 w-4 flex-shrink-0 text-i-blue" />
                <p>
                  Cahier des charges du projet : <strong className="text-i-primary">{infoCdc.cdc_nom}</strong>.
                  Il sera analysé si vous n'importez pas d'autre fichier.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <IconDocument className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Aucun cahier des charges n'est joint à ce projet. Importez-le ci-dessous, ou{" "}
                  <Link to={`/projets/${projetId}`} className="font-semibold underline hover:text-amber-900">
                    ajoutez-le dans les documents du projet
                  </Link>
                  .
                </p>
              </div>
            )
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {cdcDuProjet ? "Analyser un autre fichier (facultatif)" : "Cahier des charges à analyser"}
            </label>

            {!fichier ? (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-i-blue hover:bg-green-50/40 transition-colors bg-slate-50 px-4 py-8"
              >
                <span className="w-10 h-10 bg-white border border-slate-200 flex items-center justify-center text-slate-500">
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
              <div className="flex items-center gap-3 border border-slate-300 bg-green-50/50 px-4 py-3">
                <IconDocument className="w-6 h-6 text-i-blue flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{fichier.name}</p>
                  <p className="text-xs text-slate-500">
                    {tailleLisible(fichier.size)} · prêt à analyser
                  </p>
                </div>
                <button
                  onClick={() => setFichier(null)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
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

          <BtnIA onClick={analyser} loading={loading} disabled={!peutAnalyser || chargementInfo} className="text-black">
            {resultat ? "Relancer l'analyse" : "Analyser le cahier des charges"}
          </BtnIA>
        </div>
      </Carte>

      {loading && <Spin label="L'IA analyse le cahier des charges…" />}

      {chargementInfo && <Spin label="Chargement de la dernière analyse…" />}

      {resultat && !loading && (
        <Carte className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900">Synthèse de l'analyse</h3>
              {analyseLe && <p className="text-xs text-slate-400">Analyse du {dateHeure(analyseLe)}</p>}
            </div>
            {resultat.modele && <BadgeIA modele={resultat.modele} />}
          </div>

          <div className="mb-4">
            <TitreSection>Périmètre</TitreSection>
            <div className="text-sm text-slate-700"><ReponseIA texte={resultat.perimetre} /></div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="bg-i-blue/5 border border-i-blue/10 p-3">
              <TitreSection className="text-i-blue">Points clés</TitreSection>
              <PuceList items={resultat.points_cles} />
            </div>
            <div className="bg-rose-50 border border-rose-100 p-3">
              <TitreSection className="text-rose-700">Risques</TitreSection>
              <PuceList items={resultat.risques} />
            </div>
          </div>

          <div className="mt-4 bg-emerald-50 border border-emerald-100 p-3">
            <TitreSection className="text-emerald-700">Recommandations</TitreSection>
            <PuceList items={resultat.recommandations} />
          </div>
        </Carte>
      )}
    </div>
  );
}
