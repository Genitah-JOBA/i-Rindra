// src/pages/Facturation.jsx — volet financier : factures clients (ADMIN uniquement).
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { facturesService } from "../api/factures";
import { clientsService } from "../api/client";
import { projetsService } from "../api/projets";
import { useMessage } from "../context/MessageContext";
import Spin from "../components/Spin";
import { exportFacturesPdf } from "../utils/exportFacturesPdf";
import FactureModal from "../components/FactureModal";

// Devise d'affichage — modifiable en un seul endroit.
const DEVISE = "Ar";

const STATUTS = ["brouillon", "envoyee", "payee", "en_retard", "annulee"];

// Couleurs par statut (badge + select)
const STATUT_STYLE = {
  brouillon: "bg-slate-100 text-slate-600 border-slate-200",
  envoyee: "bg-blue-100 text-blue-700 border-blue-200",
  payee: "bg-emerald-100 text-emerald-700 border-emerald-200",
  en_retard: "bg-red-100 text-red-700 border-red-200",
  annulee: "bg-slate-100 text-slate-400 border-slate-200 line-through",
};

const STATUT_LABELS = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const FORM_VIDE = {
  client_id: "",
  projet_id: "",
  date_emission: new Date().toISOString().slice(0, 10),
  date_echeance: "",
  montant_ht: "",
  taux_tva: "20",
  notes: "",
};

function formatMontant(n) {
  const v = Number(n || 0);
  return (
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) + ` ${DEVISE}`
  );
}

// Fonction pour obtenir la date d'aujourd'hui au format YYYY-MM-DD
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// Fonction pour ajouter X jours à une date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

// Icône poubelle (remplace FontAwesome)
const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

export default function Facturation() {
  const { showSuccess, showError } = useMessage();
  const tableRef = useRef(null);

  const [factures, setFactures] = useState([]);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  // Facture ouverte en détail (clic sur une ligne)
  const [factureActive, setFactureActive] = useState(null);
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [dateEmissionError, setDateEmissionError] = useState("");
  const [dateEcheanceError, setDateEcheanceError] = useState("");

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const params = filtreStatut ? { statut: filtreStatut } : {};
      const [facts, st] = await Promise.all([
        facturesService.list(params),
        facturesService.stats().catch(() => null),
      ]);
      setFactures(facts || []);
      setStats(st);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Listes déroulantes (chargées une fois)
  const chargerReferentiels = async () => {
    try {
      const [cl, pr] = await Promise.all([
        clientsService.list().catch(() => []),
        projetsService.list().catch(() => []),
      ]);
      setClients(cl || []);
      setProjets(pr || []);
    } catch (err) {
      console.error("Erreur chargement référentiels:", err);
    }
  };

  useEffect(() => {
    chargerReferentiels();
  }, []);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreStatut]);

  // TTC calculé en direct dans la modale
  const ttcApercu = () => {
    const ht = parseFloat(form.montant_ht) || 0;
    const taux = parseFloat(form.taux_tva) || 0;
    return ht + (ht * taux) / 100;
  };

  const ouvrirAjout = () => {
    setEditionId(null);
    const today = getToday();
    setForm({
      ...FORM_VIDE,
      client_id: "",
      projet_id: "",
      date_emission: today,
      date_echeance: addDays(today, 30),
      montant_ht: "",
      taux_tva: "20",
    });
    setFormErreur("");
    setDateEmissionError("");
    setDateEcheanceError("");
    setModalOuvert(true);
  };

  const ouvrirEdition = (f) => {
    setEditionId(f.id);
    setForm({
      client_id: String(f.client_id ?? ""),
      projet_id: f.projet_id ? String(f.projet_id) : "",
      date_emission: f.date_emission || getToday(),
      date_echeance: f.date_echeance || addDays(getToday(), 30),
      montant_ht: String(f.montant_ht ?? ""),
      taux_tva: String(f.taux_tva ?? "20"),
      notes: f.notes || "",
    });
    setFormErreur("");
    setDateEmissionError("");
    setDateEcheanceError("");
    setModalOuvert(true);
  };

  const validateDates = () => {
    const today = getToday();
    let isValid = true;

    if (form.date_emission && form.date_emission > today) {
      setDateEmissionError("La date d'émission ne peut pas être dans le futur");
      isValid = false;
    } else {
      setDateEmissionError("");
    }

    if (form.date_echeance && form.date_echeance < today) {
      setDateEcheanceError("La date d'échéance ne peut pas être dans le passé");
      isValid = false;
    } else {
      setDateEcheanceError("");
    }

    if (form.date_emission && form.date_echeance && form.date_echeance < form.date_emission) {
      setDateEcheanceError("La date d'échéance doit être après la date d'émission");
      isValid = false;
    }

    return isValid;
  };

  const enregistrer = async (ev) => {
    ev.preventDefault();
    setFormErreur("");
    setDateEmissionError("");
    setDateEcheanceError("");

    if (!form.client_id) {
      const msg = "Le client est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.projet_id) {
      const msg = "Le projet est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_emission) {
      const msg = "La date d'émission est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.date_echeance) {
      const msg = "La date d'échéance est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.montant_ht || parseFloat(form.montant_ht) <= 0) {
      const msg = "Le montant HT est obligatoire et doit être supérieur à 0";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.taux_tva || parseFloat(form.taux_tva) < 0) {
      const msg = "Le taux de TVA est obligatoire";
      setFormErreur(msg);
      showError(msg);
      return;
    }

    if (!validateDates()) {
      if (dateEmissionError) showError(dateEmissionError);
      if (dateEcheanceError) showError(dateEcheanceError);
      return;
    }

    setEnregistrement(true);
    try {
      const payload = {
        client_id: Number(form.client_id),
        projet_id: Number(form.projet_id),
        date_emission: form.date_emission || null,
        date_echeance: form.date_echeance || null,
        montant_ht: parseFloat(form.montant_ht) || 0,
        taux_tva: parseFloat(form.taux_tva) || 0,
        notes: form.notes || null,
      };
      if (editionId) {
        await facturesService.update(editionId, payload);
        showSuccess("La facture a été modifiée avec succès !");
      } else {
        await facturesService.create(payload);
        showSuccess("La facture a été créée avec succès !");
      }
      setModalOuvert(false);
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de l'enregistrement.";
      setFormErreur(msg);
      showError(msg);
    } finally {
      setEnregistrement(false);
    }
  };

  const changerStatut = async (f, statut) => {
    try {
      await facturesService.setStatut(f.id, statut);
      showSuccess(
        `Statut de la facture ${f.numero} mis à jour : ${STATUT_LABELS[statut] || statut}`
      );
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Impossible de changer le statut.";
      showError(msg);
    }
  };

  // Confirmation de suppression
  const supprimer = async (f) => {
    const confirmed = await new Promise((resolve) => {
      const container = document.createElement("div");
      container.className =
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate__animated animate__fadeIn";
      document.body.appendChild(container);

      const ConfirmationDialog = () => {
        const [visible, setVisible] = useState(true);

        const handleConfirm = () => {
          setVisible(false);
          setTimeout(() => {
            if (container.parentNode) {
              container.parentNode.removeChild(container);
            }
            resolve(true);
          }, 300);
        };

        const handleCancel = () => {
          setVisible(false);
          setTimeout(() => {
            if (container.parentNode) {
              container.parentNode.removeChild(container);
            }
            resolve(false);
          }, 300);
        };

        return (
          <div
            className={`bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate__animated animate__zoomIn ${
              !visible ? "animate__animated animate__zoomOut" : ""
            }`}
          >
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-lg font-semibold">Confirmation de suppression</h3>
            </div>
            <p className="text-slate-600 mb-2">{"Supprimer cette facture ?"}</p>
            <p className="font-mono text-sm text-slate-800 bg-slate-50 p-2 rounded mb-4">
              {f.numero} - {f.client_nom}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        );
      };

      import("react-dom/client").then(({ createRoot }) => {
        const root = createRoot(container);
        root.render(<ConfirmationDialog />);
      });
    });

    if (!confirmed) return;

    try {
      await facturesService.remove(f.id);
      showSuccess(`La facture ${f.numero} a été supprimée.`);
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Suppression impossible.";
      showError(msg);
    }
  };

  const carte = (label, valeur, couleur) => (
    <div className="border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${couleur}`}>{valeur}</p>
    </div>
  );

  // ========== EXPORT PDF (charte i-Rindra) ==========
  const exportPDF = async () => {
    try {
      await exportFacturesPdf({ factures, clients });
      showSuccess("PDF exporté avec succès !");
    } catch (err) {
      showError("Erreur lors de l'export PDF.");
      console.error(err);
    }
  };

  // ========== RENDU ==========

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {"Facturation"}
          </h1>
          <p className="text-sm text-slate-500">{"Factures clients et suivi des paiements."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportPDF}
            disabled={factures.length === 0}
            className="flex items-center gap-2 border border-i-primary/20 bg-white px-3 py-2 text-xs font-semibold text-i-primary transition hover:border-i-blue hover:bg-[#EEFBF6] disabled:opacity-50"
            title="Exporter la liste des factures en PDF"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v6a2 2 0 002 2h6" />
            </svg>
            Exporter en PDF
          </button>
          <button
            onClick={ouvrirAjout}
            className="bg-brand-gradient px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
          >
            + {"Nouvelle facture"}
          </button>
        </div>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {carte(
            "CA encaissé",
            formatMontant(stats.ca_encaisse),
            "text-emerald-600"
          )}
          {carte(
            "En attente",
            formatMontant(stats.en_attente),
            "text-blue-600"
          )}
          {carte("Factures", stats.total_factures, "text-slate-800")}
          {carte("Impayées", stats.impayees, "text-red-600")}
        </div>
      )}

      {/* Filtre */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
        >
          <option value="">{"Tous les statuts"}</option>
          {STATUTS.map((s) => (
            <option key={s} value={s}>
              {STATUT_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {factures.length} facture{factures.length > 1 ? "s" : ""}
        </span>
      </div>

      {loading && <Spin taille="lg" className="py-12" />}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && (
        <div className="overflow-x-auto border bg-white shadow-sm" ref={tableRef}>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{"N°"}</th>
                <th className="px-4 py-3">{"Client"}</th>
                <th className="px-4 py-3">{"Projet"}</th>
                <th className="px-4 py-3">{"Émission"}</th>
                <th className="px-4 py-3">{"Échéance"}</th>
                <th className="px-4 py-3 text-right">{"Total TTC"}</th>
                <th className="px-4 py-3">{"Statut"}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {factures.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => setFactureActive(f)}
                  className="cursor-pointer hover:bg-[#EEFBF6]"
                  title="Voir le détail de la facture"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">
                    {f.numero}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {f.client_nom || `#${f.client_id}`}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {f.projet_nom || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{f.date_emission}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {f.date_echeance || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {formatMontant(f.montant_ttc)}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={f.statut}
                      onChange={(e) => changerStatut(f, e.target.value)}
                      className={`border px-2 py-1 text-xs font-medium outline-none ${
                        STATUT_STYLE[f.statut] || ""
                      }`}
                    >
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>
                          {STATUT_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        onClick={() => ouvrirEdition(f)}
                        className="text-slate-500 hover:text-i-blue"
                      >
                        {"Modifier"}
                      </button>
                      <button
                        onClick={() => supprimer(f)}
                        className="flex items-center gap-1 text-slate-500 hover:text-red-600"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        {"Supprimer"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {factures.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {"Aucune facture pour l'instant."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {factureActive && (
        <FactureModal
          facture={factureActive}
          devise={clients.find((c) => c.id === factureActive.client_id)?.devise || "Ar"}
          onClose={() => setFactureActive(null)}
          onModifier={() => {
            const f = factureActive;
            setFactureActive(null);
            ouvrirEdition(f);
          }}
        />
      )}

      {/* MODALE AJOUT / ÉDITION AVEC PROJET OBLIGATOIRE
          Rendue dans document.body (portal) : dessinée dans la page, elle restait
          sous l'en-tête collant, piégée par le contexte d'empilement du contenu. */}
      {modalOuvert && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-i-primary/60 p-4 backdrop-blur-[2px] animate__animated animate__fadeIn animate__faster sm:items-center">
          <div className="my-6 w-full max-w-lg bg-white p-6 shadow-2xl animate__animated animate__zoomIn animate__faster">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editionId ? "Modifier la facture" : "Nouvelle facture"}
            </h2>
            <form onSubmit={enregistrer} className="space-y-3">
              {(formErreur || dateEmissionError || dateEcheanceError) && (
                <div className="bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                  {formErreur && <p>⚠️ {formErreur}</p>}
                  {dateEmissionError && <p>⚠️ {dateEmissionError}</p>}
                  {dateEcheanceError && <p>⚠️ {dateEcheanceError}</p>}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Entreprise {"Client"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.client_id}
                    onChange={(e) => {
                      const clientId = e.target.value;
                      setForm({
                        ...form,
                        client_id: clientId,
                        projet_id: "",
                      });
                    }}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
                  >
                    <option value="">— Sélectionner un client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {"Projet (optionnel)"} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.projet_id}
                    onChange={(e) =>
                      setForm({ ...form, projet_id: e.target.value })
                    }
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
                    disabled={!form.client_id}
                  >
                    <option value="">
                      {form.client_id
                        ? "— Sélectionner un projet —"
                        : "— Sélectionnez d'abord un client —"}
                    </option>
                    {projets
                      .filter((p) => {
                        if (!form.client_id) return false;
                        return String(p.client_id) === String(form.client_id);
                      })
                      .map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.nom}
                        </option>
                      ))}
                  </select>
                  {form.client_id &&
                    projets.filter(
                      (p) => String(p.client_id) === String(form.client_id)
                    ).length === 0 && (
                      <p className="mt-1 text-xs text-amber-600">
                        ⚠️ Aucun projet trouvé pour ce client
                      </p>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {"Date d'émission"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date_emission}
                    onChange={(e) => {
                      setForm({ ...form, date_emission: e.target.value });
                      setDateEmissionError("");
                    }}
                    max={getToday()}
                    required
                    className={`w-full border px-3 py-2 text-sm outline-none focus:border-i-blue ${
                      dateEmissionError ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Date d'émission (max: aujourd'hui)
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {"Date d'échéance"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date_echeance}
                    onChange={(e) => {
                      setForm({ ...form, date_echeance: e.target.value });
                      setDateEcheanceError("");
                    }}
                    min={getToday()}
                    required
                    className={`w-full border px-3 py-2 text-sm outline-none focus:border-i-blue ${
                      dateEcheanceError ? "border-red-500" : "border-slate-300"
                    }`}
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Date d'échéance (min: aujourd'hui)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {"Montant HT"} ({DEVISE}){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.montant_ht}
                    onChange={(e) =>
                      setForm({ ...form, montant_ht: e.target.value })
                    }
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {"TVA (%)"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.taux_tva}
                    onChange={(e) =>
                      setForm({ ...form, taux_tva: e.target.value })
                    }
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
                    placeholder="20"
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-3 py-2 text-right text-sm">
                <span className="text-slate-500">{"Total TTC"} : </span>
                <span className="font-semibold text-slate-800">
                  {formatMontant(ttcApercu())}
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {"Notes"}
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
                  placeholder="Notes optionnelles..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {"Annuler"}
                </button>
                <button
                  type="submit"
                  disabled={enregistrement}
                  className="bg-brand-gradient px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                >
                  {enregistrement
                    ? "Enregistrement…"
                    : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}