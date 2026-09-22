// src/pages/AssistantIA/AnalyseProjetTab.jsx — analyses sur un projet :
// variante "resume" = RF-27 résumé d'avancement
// variante "detec"  = RF-28 détection de retards / blocages
// variante "statut" = RF-29 proposition de statut santé
import { useState } from "react";
import { iaService } from "../../api/ia";
import { useMessage } from "../../context/MessageContext";
import { Carte, BtnIA, SelectProjet, AlertErreur, BadgeIA, TitreSection, PuceList, Spin, IconCheckCircle, IconExclamationCircle, IconAlertTriangle } from "./Shared";

const CONFIG = {
  resume: {
    label: "Résumé d'avancement",
    bouton: "Générer le résumé",
    loading: "L'IA résume l'avancement…",
    service: (id) => iaService.resumeProjet(id),
  },
  detec: {
    label: "Retards & blocages",
    bouton: "Détecter les alertes",
    loading: "L'IA analyse les risques…",
    service: (id) => iaService.detection(id),
  },
  statut: {
    label: "Statut santé proposé",
    bouton: "Proposer un statut",
    loading: "L'IA évalue la santé du projet…",
    service: (id) => iaService.statutPropose(id),
  },
};

const VARIANTES = [
  { id: "resume", label: "Résumé" },
  { id: "detec", label: "Retards & blocages" },
  { id: "statut", label: "Statut santé" },
];

const NIVEAU_ALERTE = {
  rouge: "border-red-200 bg-red-50 text-red-800",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const STATUT_SANTE = {
  vert: {
    texte: "En bonne santé",
    classe: "bg-green-100 text-green-800 border-green-200",
    Icon: IconCheckCircle,
  },
  orange: {
    texte: "À surveiller",
    classe: "bg-orange-100 text-orange-800 border-orange-200",
    Icon: IconExclamationCircle,
  },
  rouge: {
    texte: "En danger",
    classe: "bg-red-100 text-red-800 border-red-200",
    Icon: IconAlertTriangle,
  },
};

const LIBELLE_TYPE = {
  retard: "Retard",
  blocage: "Blocage",
  risque: "Risque",
};

export default function AnalyseProjetTab({ variante: varianteInitiale, projets, gestion = false }) {
  const { showSuccess, showError } = useMessage();
  const compatibles = gestion
    ? VARIANTES
    : VARIANTES.filter((v) => v.id === "resume");
  const [varianteId, setVarianteId] = useState(
    varianteInitiale && compatibles.some((v) => v.id === varianteInitiale)
      ? varianteInitiale
      : compatibles[0]?.id || "resume",
  );
  const conf = CONFIG[varianteId];
  const [projetId, setProjetId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState("");

  const changerVariante = (id) => {
    setVarianteId(id);
    setResultat(null);
    setErreur("");
  };

  const lancer = async () => {
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
      const data = await conf.service(projetId);
      setResultat(data);
      showSuccess("Analyse terminée.");
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

      {compatibles.length > 1 && (
        <div className="inline-flex flex-wrap items-center gap-1 border border-slate-200 bg-white p-1 shadow-sm rounded-md">
          {compatibles.map((v) => (
            <button
              key={v.id}
              onClick={() => changerVariante(v.id)}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors rounded-md ${
                varianteId === v.id
                  ? "bg-brand-gradient text-i-primary"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <Carte className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Projet</label>
            <SelectProjet projets={projets} value={projetId} onChange={setProjetId} />
          </div>
          <BtnIA onClick={lancer} loading={loading}>
            {conf.bouton}
          </BtnIA>
        </div>
      </Carte>

      {loading && <Spin label={conf.loading} />}

      {resultat && (
        <Carte className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">{conf.label}</h3>
            <BadgeIA modele={resultat.modele} />
          </div>

          {varianteId === "resume" && (
            <>
              {resultat.avancement_estime != null && (
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avancement estimé</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-gradient rounded-full transition-all"
                      style={{ width: `${Math.min(resultat.avancement_estime, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-700">
                    {resultat.avancement_estime.toFixed(1)} %
                  </span>
                </div>
              )}
              <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{resultat.resume}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                  <TitreSection className="text-emerald-700">Points forts</TitreSection>
                  <PuceList items={resultat.points_forts} />
                </div>
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg">
                  <TitreSection className="text-amber-700">Points d'attention</TitreSection>
                  <PuceList items={resultat.points_attention} />
                </div>
              </div>
            </>
          )}

          {varianteId === "detec" && (
            <>
              {resultat.alertes.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-3 rounded-lg">
                  <IconCheckCircle className="w-4 h-4 flex-shrink-0" />
                  Aucune alerte détectée : le projet semble sain.
                </p>
              ) : (
                <div className="space-y-2">
                  {resultat.alertes.map((a, i) => (
                    <div key={i} className={`flex flex-col gap-1 px-4 py-3 border rounded-lg ${NIVEAU_ALERTE[a.niveau] || NIVEAU_ALERTE.info}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 bg-white/70 rounded-full">
                          {LIBELLE_TYPE[a.type] || a.type}
                        </span>
                        {a.tache_titre && <span className="text-xs font-medium">« {a.tache_titre} »</span>}
                      </div>
                      <p className="text-sm">{a.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {varianteId === "statut" && (() => {
                const sante = STATUT_SANTE[resultat.statut_propose];
                return (
                  <>
                    <div className={`mb-4 inline-flex items-center gap-1.5 px-4 py-2 border rounded-lg text-sm font-bold ${sante?.classe}`}>
                      {sante && <sante.Icon className="w-4 h-4 flex-shrink-0" />}
                      {sante?.texte || resultat.statut_propose}
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{resultat.justification}</p>
                  </>
                );
              })()}
        </Carte>
      )}
    </div>
  );
}
