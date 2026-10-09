// src/components/DevisModal.jsx — « Voir le détail » d'un devis, présenté comme le PDF
// (gabarit B-esti, charte i-Rindra). Les données viennent de /suggestion-devis/{id}/apercu :
// mêmes extraction et mise en forme que le PDF, donc mêmes chiffres.
// Rendu dans document.body via createPortal pour passer au-dessus du header sticky.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { suggestionDevisService } from "../api/suggestionDevis";
import DevisContenu from "./DevisContenu";
import BoutonPdfDevis from "./BoutonPdfDevis";
import Spin from "./Spin";

const STATUTS = {
  en_attente: { libelle: "En attente", style: "bg-amber-100 text-amber-800" },
  validee: { libelle: "Validé", style: "bg-i-green/25 text-i-primary" },
  refusee: { libelle: "Refusé", style: "bg-red-100 text-red-700" },
};

const Etiquette = ({ children }) => (
  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.25em] text-i-blue">{children}</p>
);

export default function DevisModal({ devis, onClose, avecPdf = false }) {
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let actif = true;
    suggestionDevisService
      .apercu(devis.id)
      .then((d) => actif && setApercu(d))
      .catch(() => actif && setErreur("Aperçu indisponible : affichage du texte du devis."));
    return () => {
      actif = false;
    };
  }, [devis.id]);

  const statut = STATUTS[devis.statut] || STATUTS.en_attente;
  const lignes = apercu?.lignes || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-i-primary/60 p-4 backdrop-blur-[2px] animate__animated animate__fadeIn animate__faster"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col bg-white shadow-2xl animate__animated animate__zoomIn animate__faster"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-8 py-7">
          {/* En-tête : logo + agence | DEVIS + numéro + dates + statut */}
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <img src="/Logo-i-Rindra-text-couleur.png" alt="i-Rindra" className="h-12 w-auto" />
              <p className="mt-3 text-sm font-bold text-i-primary">Bienfe Agency</p>
              <p className="text-xs text-slate-500">Antananarivo, Madagascar</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tracking-[0.35em] text-i-primary">DEVIS</p>
              <p className="mt-1 text-base font-bold text-i-blue">N° {apercu?.numero || "…"}</p>
              <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                <p>
                  Date d'émission <span className="ml-3 font-bold text-i-primary">{apercu?.date_emission || "—"}</span>
                </p>
                <p>
                  Valable jusqu'au <span className="ml-3 font-bold text-i-primary">{apercu?.valable_jusqu_au || "—"}</span>
                </p>
              </div>
              <span className={`mt-2 inline-block px-3 py-0.5 text-xs font-semibold ${statut.style}`}>
                {statut.libelle}
              </span>
            </div>
          </div>

          {/* Séparateur aux couleurs de la charte */}
          <div className="my-5 h-1.5 bg-gradient-to-r from-i-blue via-i-green to-i-turquoise" />

          {/* Adressé à / Projet */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border border-slate-200 px-5 py-4">
              <Etiquette>Adressé à</Etiquette>
              <p className="font-bold text-i-primary">{apercu?.client?.nom || devis.client_nom || "Client non renseigné"}</p>
              {[apercu?.client?.contact, apercu?.client?.email, apercu?.client?.telephone]
                .filter(Boolean)
                .map((info) => (
                  <p key={info} className="text-sm text-slate-600">{info}</p>
                ))}
            </div>
            <div className="border border-slate-200 px-5 py-4">
              <Etiquette>Projet</Etiquette>
              <p className="font-bold text-i-primary">
                {apercu?.projet_nom || devis.projet_nom || devis.titre || "Projet non renseigné"}
              </p>
              {devis.titre && devis.titre !== (apercu?.projet_nom || devis.projet_nom) && (
                <p className="text-sm text-slate-600">{devis.titre}</p>
              )}
            </div>
          </div>

          {!apercu && !erreur && <Spin className="py-10" />}

          {/* Tableau des prestations (même rendu que le PDF) */}
          {apercu && lignes.length > 0 && (
            <>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm [&_td]:border-x-0 [&_th]:border-0">
                  <thead>
                    <tr className="bg-i-primary text-[11px] font-bold uppercase tracking-wider text-white">
                      <th className="px-3 py-3 text-left">#</th>
                      <th className="px-3 py-3 text-left">Désignation</th>
                      <th className="px-3 py-3 text-right">Qté</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">Prix unitaire</th>
                      <th className="px-3 py-3 text-right">Taxe</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={i} className="border-b border-slate-200 align-top">
                        <td className="px-3 py-2.5 text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-bold text-i-primary">{l.designation}</p>
                          {l.details.map((d) => (
                            <p key={d} className="text-xs text-slate-500">– {d}</p>
                          ))}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{l.quantite}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{l.prix_unitaire}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{l.taxe}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-i-primary whitespace-nowrap">{l.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Résumé + totaux */}
              <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
                <div className="text-sm text-slate-700">
                  <p>
                    <b>{lignes.length}</b> ligne{lignes.length > 1 ? "s" : ""}
                    {apercu.nb_jours && (
                      <>
                        {" "}· <b>{apercu.nb_jours}</b> j au total
                      </>
                    )}
                    .
                  </p>
                  <p className="mt-1">Montants exprimés en {apercu.devise}.</p>
                </div>
                <div className="w-full max-w-xs">
                  <div className="flex justify-between px-2 py-1 text-sm">
                    <span className="text-slate-600">Total HT</span>
                    <span className="font-bold text-i-primary">{apercu.total_ht}</span>
                  </div>
                  <div className="flex justify-between px-2 py-1 text-sm">
                    <span className="text-slate-600">{apercu.libelle_taxe}</span>
                    <span className="font-bold text-i-primary">{apercu.taxes}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between bg-gradient-to-r from-i-blue via-i-green to-i-turquoise px-4 py-3 text-lg font-bold text-i-primary">
                    <span>Total TTC</span>
                    <span>{apercu.total_ttc}</span>
                  </div>
                </div>
              </div>

              {apercu.conditions.length > 0 && (
                <div className="mt-6">
                  <Etiquette>Conditions de paiement et délais</Etiquette>
                  {apercu.conditions.map((c) => (
                    <p key={c} className="text-xs leading-relaxed text-slate-600">• {c}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Aucun tableau exploitable (ou aperçu indisponible) : texte du devis */}
          {(erreur || (apercu && lignes.length === 0)) && (
            <div className="mt-6">
              {erreur && <p className="mb-3 text-xs text-amber-700">{erreur}</p>}
              <Etiquette>Détail du devis</Etiquette>
              <DevisContenu contenu={devis.contenu_devis} />
            </div>
          )}

          {/* Demande à l'origine du devis */}
          {devis.demande && (
            <div className="mt-6 border border-dashed border-i-turquoise bg-[#EEFBF6] px-5 py-3">
              <Etiquette>Demande</Etiquette>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{devis.demande}</p>
            </div>
          )}

          <p className="mt-5 text-[11px] text-slate-500">
            Devis proposé par l'assistant IA d'i-Rindra{devis.modele ? ` (${devis.modele})` : ""}
            {devis.statut === "validee" ? " et validé par la direction." : ", sous réserve de validation par la direction."}
          </p>
        </div>

        {/* Pied */}
        <div className="flex justify-end gap-2 border-t border-i-turquoise/40 bg-[#EEFBF6] px-6 py-3">
          {avecPdf && <BoutonPdfDevis devis={devis} className="px-4 py-2 text-sm" />}
          <button
            onClick={onClose}
            className="border border-i-primary/20 bg-white px-4 py-2 text-sm font-medium text-i-primary hover:border-i-primary/40 hover:bg-slate-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
