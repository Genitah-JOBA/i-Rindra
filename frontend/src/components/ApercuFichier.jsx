// src/components/ApercuFichier.jsx — consultation d'un document du projet dans
// l'application, sans le télécharger : PDF et images affichés tels quels,
// textes et documents Word affichés en texte.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fichiersService } from "../api/fichiers";
import Spin from "./Spin";
import ReponseIA from "./ReponseIA";

// Le corps d'une erreur demandée en `blob` est lui-même un Blob : on le relit.
async function messageErreur(err) {
  const data = err.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).detail;
    } catch {
      return null;
    }
  }
  return data?.detail;
}

export default function ApercuFichier({ projetId, fichier, onClose }) {
  const [etat, setEtat] = useState({ chargement: true });

  useEffect(() => {
    let url = null;
    let annule = false;
    fichiersService
      .apercu(projetId, fichier.id)
      .then(async ({ blob, type }) => {
        if (annule) return;
        if (type.startsWith("text/")) {
          const texte = await blob.text();
          if (!annule) setEtat({ texte });
          return;
        }
        url = URL.createObjectURL(blob);
        setEtat({ url, image: type.startsWith("image/") });
      })
      .catch(async (err) => {
        if (!annule) setEtat({ erreur: (await messageErreur(err)) || "Aperçu impossible." });
      });
    return () => {
      annule = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projetId, fichier.id]);

  // Fermeture par Échap
  useEffect(() => {
    const surTouche = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate__animated animate__fadeIn"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-full max-w-5xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <p className="min-w-0 truncate font-semibold text-i-primary" title={fichier.nom}>
            {fichier.nom}
          </p>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
          {etat.chargement && <Spin taille="lg" className="py-24" />}
          {etat.erreur && (
            <p className="m-6 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{etat.erreur}</p>
          )}
          {etat.texte !== undefined && (
            <div className="mx-auto my-4 max-w-3xl bg-white p-6 text-sm leading-relaxed text-slate-700 shadow-sm sm:p-10">
              <ReponseIA texte={etat.texte} />
            </div>
          )}
          {etat.url && etat.image && (
            <div className="flex min-h-full items-center justify-center p-4">
              <img src={etat.url} alt={fichier.nom} className="max-h-full max-w-full object-contain" draggable={false} />
            </div>
          )}
          {etat.url && !etat.image && (
            // #toolbar=0 : masque la barre (dont le bouton d'enregistrement) du lecteur PDF du navigateur
            <iframe src={`${etat.url}#toolbar=0&navpanes=0`} title={fichier.nom} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
