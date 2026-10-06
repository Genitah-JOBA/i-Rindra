// src/components/LiaisonBesti.jsx — carte « Liaison B-esti » (Paramètres, direction / DRH).
// Pendant du bouton « Tester la liaison » de B-esti, lancé depuis iRindra.
import { useState } from "react";
import { bestiService } from "../api/besti";

const IconePrise = ({ className = "h-4 w-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  </svg>
);

function Ligne({ titre, sousTitre, resultat }) {
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-i-primary">{titre}</p>
        <p className="text-xs text-slate-500">{sousTitre}</p>
        {resultat && (
          <p className={`mt-1 text-xs ${resultat.succes ? "text-slate-600" : "text-red-600"}`}>
            {resultat.message}
          </p>
        )}
      </div>
      {resultat && (
        <span
          className={`shrink-0 self-start px-2 py-0.5 text-xs font-semibold ${
            resultat.succes ? "bg-i-green/25 text-i-primary" : "bg-red-100 text-red-700"
          }`}
        >
          {resultat.succes ? "OK" : "Échec"}
          {resultat.code ? ` · ${resultat.code}` : ""}
        </span>
      )}
    </div>
  );
}

export default function LiaisonBesti() {
  const [resultat, setResultat] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const tester = async () => {
    setEnCours(true);
    setErreur("");
    try {
      setResultat(await bestiService.testerLiaison());
    } catch (err) {
      setErreur(err?.response?.data?.detail || "Test impossible : l'API d'iRindra ne répond pas.");
    } finally {
      setEnCours(false);
    }
  };

  const config = resultat?.configuration;

  return (
    <section className="mt-6 border bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center bg-i-blue/15 text-i-blue">
          <IconePrise />
        </span>
        <h2 className="font-brand text-base font-semibold text-i-primary">Liaison B-esti</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Vérifie la connexion avec B-esti dans les deux sens, sans rien créer ni modifier.
      </p>

      {config && (
        <p className="mb-2 text-xs text-slate-500">
          Adresse B-esti : <span className="font-mono text-i-primary">{config.besti_url || "non définie"}</span>
          {" · "}clé d'API : {config.cle_api ? "définie" : "absente"}
          {" · "}secret des webhooks : {config.secret_webhook ? "défini" : "absent"}
        </p>
      )}

      {resultat && (
        <div className="mb-4 border border-slate-200 px-4">
          <Ligne
            titre="iRindra → B-esti"
            sousTitre="Clé d'API (BESTI_API_KEY) utilisée pour vérifier la connexion des clients B-esti."
            resultat={resultat.irindra_vers_besti}
          />
          <Ligne
            titre="B-esti → iRindra"
            sousTitre="Route /besti/webhook et secret de signature (BESTI_WEBHOOK_SECRET)."
            resultat={resultat.besti_vers_irindra}
          />
        </div>
      )}

      {erreur && (
        <p className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>
      )}

      <button
        type="button"
        onClick={tester}
        disabled={enCours}
        className="flex items-center gap-2 border border-i-primary/20 bg-white px-4 py-2 text-sm font-medium text-i-primary transition-colors hover:border-i-blue hover:bg-[#EEFBF6] disabled:opacity-50"
      >
        <IconePrise />
        {enCours ? "Test en cours…" : "Tester la liaison"}
      </button>
    </section>
  );
}
