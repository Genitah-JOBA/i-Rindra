// src/pages/SuggestionDevis.jsx — devis suggérés par l'IA (direction / DRH uniquement).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { suggestionDevisService } from "../api/suggestionDevis";
import { clientsService } from "../api/client";
import { projetsService } from "../api/projets";
import { useMessage } from "../context/MessageContext";
import DevisModal from "../components/DevisModal";
import "animate.css";

const FORM_VIDE = {
  client_id: "",
  projet_id: "",
  titre: "",
  demande: "",
};

const LIBELLE_STATUT = {
  en_attente: "À valider",
  validee: "Validé",
  refusee: "Refusé",
};

const STYLE_STATUT = {
  en_attente: "bg-amber-100 text-amber-700",
  validee: "bg-green-100 text-green-700",
  refusee: "bg-red-100 text-red-700",
};

function IconSparkles({ className = "w-5 h-5" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

function IconTrash({ className = "w-4 h-4" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
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
}

function IconCheck({ className = "w-4 h-4" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

function IconX({ className = "w-4 h-4" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export default function SuggestionDevis() {
  const { showSuccess, showError } = useMessage();
  const naviguer = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [clients, setClients] = useState([]);
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [generation, setGeneration] = useState(false);
  const [devisDetail, setDevisDetail] = useState(null);

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const data = await suggestionDevisService.list();
      setSuggestions(data || []);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const chargerReferentiels = async () => {
    try {
      const [cl, pr] = await Promise.all([
        clientsService.list().catch(() => []),
        projetsService.list().catch(() => []),
      ]);
      setClients(cl || []);
      setProjets(pr || []);
    } catch {
      setClients([]);
      setProjets([]);
    }
  };

  useEffect(() => {
    charger();
    chargerReferentiels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projetsDuClient = projets.filter(
    (p) => String(p.client_id) === String(form.client_id)
  );

  const ouvrirAjout = () => {
    setForm(FORM_VIDE);
    setFormErreur("");
    setModalOuvert(true);
  };

  const generer = async (ev) => {
    ev.preventDefault();
    setFormErreur("");

    if (!form.client_id) {
      const msg = "Le client est obligatoire.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.projet_id) {
      const msg = "Le projet est obligatoire.";
      setFormErreur(msg);
      showError(msg);
      return;
    }
    if (!form.demande.trim()) {
      const msg = "Décrivez la prestation à deviser.";
      setFormErreur(msg);
      showError(msg);
      return;
    }

    setGeneration(true);
    try {
      const payload = {
        client_id: Number(form.client_id),
        projet_id: Number(form.projet_id),
        titre: form.titre.trim() || null,
        demande: form.demande.trim(),
      };
      const nouvelle = await suggestionDevisService.genererIA(payload);
      setSuggestions((prev) => [nouvelle, ...prev]);
      setModalOuvert(false);
      showSuccess("Devis généré par l'IA et sauvegardé !");
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        "Erreur lors de la génération du devis par l'IA.";
      setFormErreur(msg);
      showError(msg);
    } finally {
      setGeneration(false);
    }
  };

  const supprimer = async (s) => {
    const confirmed = window.confirm(
      `Supprimer ce devis suggéré${s.titre ? ` : "${s.titre}"` : ""} ?`
    );
    if (!confirmed) return;
    try {
      await suggestionDevisService.remove(s.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      showSuccess("Suggestion de devis supprimée.");
    } catch (err) {
      const msg = err.response?.data?.detail || "Suppression impossible.";
      showError(msg);
    }
  };

  const valider = async (s) => {
    try {
      await suggestionDevisService.setStatut(s.id, "validee");
      showSuccess("Devis validé. Redirection vers Devis & Estimation…");
      naviguer("/devis-estimations");
    } catch (err) {
      const msg = err.response?.data?.detail || "Validation impossible.";
      showError(msg);
    }
  };

  const refuser = async (s) => {
    const confirmed = window.confirm(
      `Refuser ce devis suggéré${s.titre ? ` : "${s.titre}"` : ""} ?`
    );
    if (!confirmed) return;
    try {
      await suggestionDevisService.setStatut(s.id, "refusee");
      setSuggestions((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, statut: "refusee" } : x))
      );
      showSuccess("Devis refusé.");
    } catch (err) {
      const msg = err.response?.data?.detail || "Refus impossible.";
      showError(msg);
    }
  };

  const dater = (value) =>
    value ? new Date(value).toLocaleDateString("fr-FR") : "—";

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <IconSparkles className="w-6 h-6 text-i-blue" />
            Suggestion devis par IA
          </h1>
          <p className="text-sm text-slate-500">
            Devis proposés par l'IA — direction / DRH uniquement.
          </p>
        </div>
        <button
          onClick={ouvrirAjout}
          className="flex items-center gap-2 bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <IconSparkles className="w-4 h-4" />
          Ajout devis par IA
        </button>
      </div>

      {/* Chargement */}
      {loading && (
        <div className="flex justify-center items-center py-12 animate__animated animate__pulse">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-i-blue"></div>
          <span className="ml-3 text-slate-500">Chargement…</span>
        </div>
      )}

      {/* Erreur */}
      {erreur && (
        <div className="mb-4 bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 animate__animated animate__shakeX">
          âš ï¸ {erreur}
        </div>
      )}

      {/* Liste */}
      {!loading && !erreur && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {suggestions.length === 0 && (
            <div className="lg:col-span-2 text-center py-12 bg-slate-50 border border-slate-200 animate__animated animate__fadeInUp">
              <p className="text-slate-500">
Aucun devis suggéré pour le moment. Utilisez « Ajout devis par
                IA » ou demandez un devis à l'assistant IA depuis « Intelligence
                Artificielle ».
              </p>
            </div>
          )}

          {suggestions.map((s, index) => (
            <div
              key={s.id}
              className="animate__animated animate__fadeInUp"
              style={{ animationDelay: `${0.05 + index * 0.05}s` }}
            >
              <div className="bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-i-blue transition-all duration-300 flex flex-col h-full">
<div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
  <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold text-slate-900 truncate">
        {s.titre || (s.projet_nom ? `Devis ${s.projet_nom}` : "Devis suggéré")}
      </h3>
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full ${
          STYLE_STATUT[s.statut] || STYLE_STATUT.en_attente
        }`}
      >
        {LIBELLE_STATUT[s.statut] || LIBELLE_STATUT.en_attente}
      </span>
    </div>
    <p className="text-xs text-slate-400">
      {s.client_nom ? `Client : ${s.client_nom}` : "Sans client associé"}
      {s.projet_nom ? ` · Projet : ${s.projet_nom}` : ""} ·{" "}
      {dater(s.cree_le)}
    </p>
  </div>
  <button
    onClick={() => supprimer(s)}
    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
    title="Supprimer"
  >
    <IconTrash />
  </button>
</div>

                {s.demande && (
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
                      Demande
                    </p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-2">
                      {s.demande}
                    </p>
                  </div>
                )}

                <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {s.modele && (
                    <span className="text-[10px] bg-i-blue/10 text-i-blue px-2 py-0.5 rounded-full">
                      IA · {s.modele}
                    </span>
                  )}
                  <button
                    onClick={() => setDevisDetail(s)}
                    className="flex items-center gap-1 border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Voir le détail
                  </button>
                  {s.statut === "en_attente" && (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => refuser(s)}
                        className="flex items-center gap-1 border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <IconX className="w-3.5 h-3.5" />
                        Refuser
                      </button>
                      <button
                        onClick={() => valider(s)}
                        className="flex items-center gap-1 bg-brand-gradient px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110"
                      >
                        <IconCheck className="w-3.5 h-3.5" />
                        Valider
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODALE AJOUT DEVIS PAR IA */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-lg bg-white p-6 shadow-xl animate__animated animate__zoomIn">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Ajout devis par IA
            </h2>
            <form onSubmit={generer} className="space-y-3">
              {formErreur && (
                <div className="bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                  âš ï¸ {formErreur}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Client <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.client_id}
                    onChange={(e) =>
                      setForm({ ...form, client_id: e.target.value, projet_id: "" })
                    }
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
                    Projet <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.projet_id}
                    onChange={(e) =>
                      setForm({ ...form, projet_id: e.target.value })
                    }
                    required
                    disabled={!form.client_id}
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">
                      {form.client_id
                        ? "— Sélectionner un projet —"
                        : "— Sélectionnez d'abord un client —"}
                    </option>
                    {projetsDuClient.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.nom}
                      </option>
                    ))}
                  </select>
                  {form.client_id && projetsDuClient.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      âš ï¸ Aucun projet trouvé pour ce client
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Titre (optionnel)
                </label>
                <input
                  type="text"
                  value={form.titre}
                  onChange={(e) =>
                    setForm({ ...form, titre: e.target.value })
                  }
                  placeholder="Ex. Site vitrine"
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Prestation à deviser <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={5}
                  value={form.demande}
                  onChange={(e) =>
                    setForm({ ...form, demande: e.target.value })
                  }
                  placeholder="Décrivez la prestation : le projet, les livrables, les quantités, les délais souhaités…"
                  required
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue"
                />
              </div>

              <p className="text-xs text-slate-400">
                L'IA génère un devis structuré (prestations, prix HT/TVA/TTC,
                conditions). Les montants sont indicatifs.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={generation}
                  className="flex items-center gap-2 bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {generation ? "Génération…" : "Générer par IA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    {/* MODALE DÉTAIL DEVIS */}
      {devisDetail && (
        <DevisModal
          devis={devisDetail}
          onClose={() => setDevisDetail(null)}
        />
      )}
    </div>
  );
}
