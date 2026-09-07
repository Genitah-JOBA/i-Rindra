// src/pages/Facturation.jsx — volet financier : factures clients (ADMIN uniquement).
import { useEffect, useState } from "react";
import { facturesService } from "../api/factures";
import { clientsService } from "../api/client";
import { projetsService } from "../api/projets";
import { useLang } from "../i18n/LangContext";

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

export default function Facturation() {
  const { t } = useLang();

  const [factures, setFactures] = useState([]);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

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
      setErreur(err.response?.data?.detail || "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  // Listes déroulantes (chargées une fois)
  const chargerReferentiels = async () => {
    const [cl, pr] = await Promise.all([
      clientsService.list().catch(() => []),
      projetsService.list().catch(() => []),
    ]);
    setClients(cl || []);
    setProjets(pr || []);
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
    setForm(FORM_VIDE);
    setFormErreur("");
    setModalOuvert(true);
  };

  const ouvrirEdition = (f) => {
    setEditionId(f.id);
    setForm({
      client_id: String(f.client_id ?? ""),
      projet_id: f.projet_id ? String(f.projet_id) : "",
      date_emission: f.date_emission || "",
      date_echeance: f.date_echeance || "",
      montant_ht: String(f.montant_ht ?? ""),
      taux_tva: String(f.taux_tva ?? "20"),
      notes: f.notes || "",
    });
    setFormErreur("");
    setModalOuvert(true);
  };

  const enregistrer = async (ev) => {
    ev.preventDefault();
    setFormErreur("");
    if (!form.client_id) {
      setFormErreur(t("fact.form.client") + " *");
      return;
    }
    setEnregistrement(true);
    try {
      const payload = {
        client_id: Number(form.client_id),
        projet_id: form.projet_id ? Number(form.projet_id) : null,
        date_emission: form.date_emission || null,
        date_echeance: form.date_echeance || null,
        montant_ht: parseFloat(form.montant_ht) || 0,
        taux_tva: parseFloat(form.taux_tva) || 0,
        notes: form.notes || null,
      };
      if (editionId) {
        // projet détaché -> 0 (le backend interprète 0 comme « aucun »)
        await facturesService.update(editionId, {
          ...payload,
          projet_id: form.projet_id ? Number(form.projet_id) : 0,
        });
      } else {
        await facturesService.create(payload);
      }
      setModalOuvert(false);
      await charger();
    } catch (err) {
      setFormErreur(
        err.response?.data?.detail || "Erreur lors de l'enregistrement.",
      );
    } finally {
      setEnregistrement(false);
    }
  };

  const changerStatut = async (f, statut) => {
    try {
      await facturesService.setStatut(f.id, statut);
      await charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Impossible de changer le statut.");
    }
  };

  const supprimer = async (f) => {
    if (!window.confirm(`${t("fact.suppr")}\n${f.numero}`)) return;
    try {
      await facturesService.remove(f.id);
      await charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Suppression impossible.");
    }
  };

  const carte = (label, valeur, couleur) => (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${couleur}`}>{valeur}</p>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("fact.titre")}
          </h1>
          <p className="text-sm text-slate-500">{t("fact.sousTitre")}</p>
        </div>
        <button
          onClick={ouvrirAjout}
          className="rounded-md bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56]"
        >
          + {t("fact.nouvelle")}
        </button>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {carte(
            t("fact.stats.ca"),
            formatMontant(stats.ca_encaisse),
            "text-emerald-600",
          )}
          {carte(
            t("fact.stats.attente"),
            formatMontant(stats.en_attente),
            "text-blue-600",
          )}
          {carte(t("fact.stats.total"), stats.total_factures, "text-slate-800")}
          {carte(t("fact.stats.impayees"), stats.impayees, "text-red-600")}
        </div>
      )}

      {/* Filtre */}
      <div className="mb-4">
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
        >
          <option value="">{t("fact.filtre.tous")}</option>
          {STATUTS.map((s) => (
            <option key={s} value={s}>
              {t(`fact.statut.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-slate-500">{t("common.chargement")}</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("fact.col.numero")}</th>
                <th className="px-4 py-3">{t("fact.col.client")}</th>
                <th className="px-4 py-3">{t("fact.col.projet")}</th>
                <th className="px-4 py-3">{t("fact.col.emission")}</th>
                <th className="px-4 py-3">{t("fact.col.echeance")}</th>
                <th className="px-4 py-3 text-right">{t("fact.col.ttc")}</th>
                <th className="px-4 py-3">{t("fact.col.statut")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {factures.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
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
                  <td className="px-4 py-3">
                    <select
                      value={f.statut}
                      onChange={(e) => changerStatut(f, e.target.value)}
                      className={`rounded-full border px-2 py-1 text-xs font-medium outline-none ${STATUT_STYLE[f.statut] || ""}`}
                    >
                      {STATUTS.map((s) => (
                        <option key={s} value={s}>
                          {t(`fact.statut.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        onClick={() => ouvrirEdition(f)}
                        className="text-slate-500 hover:text-[#00B2A0]"
                      >
                        {t("common.modifier")}
                      </button>
                      <button
                        onClick={() => supprimer(f)}
                        className="text-slate-500 hover:text-red-600"
                      >
                        {t("common.supprimer")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {factures.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {t("fact.vide")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALE AJOUT / ÉDITION */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editionId ? t("fact.modal.edition") : t("fact.modal.ajout")}
            </h2>
            <form onSubmit={enregistrer} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.client")} *
                  </label>
                  <select
                    value={form.client_id}
                    onChange={(e) =>
                      setForm({ ...form, client_id: e.target.value })
                    }
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  >
                    <option value="">—</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.projet")}
                  </label>
                  <select
                    value={form.projet_id}
                    onChange={(e) =>
                      setForm({ ...form, projet_id: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  >
                    <option value="">{t("fact.form.projetAucun")}</option>
                    {projets
                      .filter(
                        (p) =>
                          !form.client_id ||
                          String(p.client_id) === String(form.client_id),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.emission")}
                  </label>
                  <input
                    type="date"
                    value={form.date_emission}
                    onChange={(e) =>
                      setForm({ ...form, date_emission: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.echeance")}
                  </label>
                  <input
                    type="date"
                    value={form.date_echeance}
                    onChange={(e) =>
                      setForm({ ...form, date_echeance: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.ht")} ({DEVISE})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.montant_ht}
                    onChange={(e) =>
                      setForm({ ...form, montant_ht: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("fact.form.tva")}
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
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
              </div>

              <div className="rounded-md bg-slate-50 px-3 py-2 text-right text-sm">
                <span className="text-slate-500">{t("fact.form.ttc")} : </span>
                <span className="font-semibold text-slate-800">
                  {formatMontant(ttcApercu())}
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("fact.form.notes")}
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                />
              </div>

              {formErreur && <p className="text-sm text-red-600">{formErreur}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {t("common.annuler")}
                </button>
                <button
                  type="submit"
                  disabled={enregistrement}
                  className="rounded-md bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56] disabled:opacity-50"
                >
                  {enregistrement
                    ? t("common.enregistrement")
                    : t("common.enregistrer")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
