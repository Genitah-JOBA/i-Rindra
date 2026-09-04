// src/pages/Clients.jsx — gestion des clients (= entreprises), avec leur accès de connexion.
import { useEffect, useState } from "react";
import { clientsService } from "../api/client";
import { utilisateursService } from "../api/utilisateurs";
import { useAuth } from "../auth/AuthContext";
import { useLang } from "../i18n/LangContext";

const FORM_VIDE = {
  nom: "",
  contact: "",
  telephone: "",
  email: "",
  mot_de_passe: "",
};

export default function Clients() {
  const { user } = useAuth();
  const { t } = useLang();
  const estGestion = user?.role === "admin" || user?.role === "direction";

  const [entreprises, setEntreprises] = useState([]);
  const [comptes, setComptes] = useState([]); // comptes de connexion (utilisateurs role=client)
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null); // null = ajout
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

  const chargerTout = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [ent, users] = await Promise.all([
        clientsService.list(),
        utilisateursService.list().catch(() => []),
      ]);
      setEntreprises(ent || []);
      setComptes((users || []).filter((u) => u.role === "client"));
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerTout();
  }, []);

  // Le compte de connexion rattaché à une entreprise (s'il existe)
  const compteDe = (clientId) => comptes.find((c) => c.client_id === clientId);

  const ouvrirAjout = () => {
    setEditionId(null);
    setForm(FORM_VIDE);
    setFormErreur("");
    setModalOuvert(true);
  };

  const ouvrirEdition = (e) => {
    setEditionId(e.id);
    setForm({
      nom: e.nom,
      contact: e.contact || "",
      telephone: e.telephone || "",
      email: e.email || "",
      mot_de_passe: "",
    });
    setFormErreur("");
    setModalOuvert(true);
  };

  const enregistrer = async (ev) => {
    ev.preventDefault();
    setFormErreur("");
    setEnregistrement(true);
    try {
      const infoEntreprise = {
        nom: form.nom,
        contact: form.contact || null,
        telephone: form.telephone || null,
        email: form.email || null,
      };

      if (editionId) {
        // Modification de l'entreprise
        await clientsService.update(editionId, infoEntreprise);
      } else {
        // Création de l'entreprise
        const entreprise = await clientsService.create(infoEntreprise);
        // Si un mot de passe est fourni, on crée aussi son accès de connexion
        if (form.mot_de_passe) {
          if (!form.email) {
            setFormErreur(
              "Un email est requis pour créer l'accès de connexion.",
            );
            setEnregistrement(false);
            return;
          }
          await utilisateursService.create({
            nom: form.nom,
            prenom: form.contact || "Client",
            email: form.email,
            mot_de_passe: form.mot_de_passe,
            role: "client",
            client_id: entreprise.id,
          });
        }
      }
      setModalOuvert(false);
      await chargerTout();
    } catch (err) {
      setFormErreur(
        err.response?.data?.detail || "Erreur lors de l'enregistrement.",
      );
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimer = async (e) => {
    if (
      !window.confirm(
        `Supprimer le client « ${e.nom} » ?\nSon accès de connexion sera aussi supprimé.`,
      )
    )
      return;
    try {
      // Supprime d'abord le compte de connexion lié (s'il existe), puis l'entreprise
      const compte = compteDe(e.id);
      if (compte) await utilisateursService.delete(compte.id);
      await clientsService.delete(e.id);
      await chargerTout();
    } catch (err) {
      alert(
        err.response?.data?.detail ||
          "Impossible de supprimer (des projets y sont peut-être encore rattachés).",
      );
    }
  };

  const filtres = entreprises.filter((e) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      e.nom?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.contact?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("clients.titre")}
          </h1>
          <p className="text-sm text-slate-500">{t("clients.sousTitre")}</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t("common.rechercher")}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
          />
          {estGestion && (
            <button
              onClick={ouvrirAjout}
              className="rounded-md bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56]"
            >
              {t("clients.nouveau")}
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-slate-500">{t("common.chargement")}</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtres.map((e) => {
            const compte = compteDe(e.id);
            return (
              <div
                key={e.id}
                className="rounded-lg border bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-sm font-semibold text-amber-700">
                    🏢
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">
                      {e.nom}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {e.email || "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                  {e.contact && (
                    <p>
                      {t("clients.contact")} : {e.contact}
                    </p>
                  )}
                  {e.telephone && (
                    <p>
                      {t("clients.tel")} : {e.telephone}
                    </p>
                  )}
                  <p>
                    {t("clients.acces")} :{" "}
                    {compte ? (
                      <span className="text-green-600">{compte.email}</span>
                    ) : (
                      <span className="text-slate-400">
                        {t("clients.aucunAcces")}
                      </span>
                    )}
                  </p>
                </div>

                {estGestion && (
                  <div className="mt-3 flex justify-end gap-2 border-t pt-2">
                    <button
                      onClick={() => ouvrirEdition(e)}
                      className="text-xs text-slate-500 hover:text-[#00B2A0]"
                    >
                      {t("common.modifier")}
                    </button>
                    <button
                      onClick={() => supprimer(e)}
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      {t("common.supprimer")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filtres.length === 0 && (
            <p className="text-sm text-slate-500">{t("clients.vide")}</p>
          )}
        </div>
      )}

      {/* MODAL AJOUT / ÉDITION */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editionId
                ? t("clients.modal.edition")
                : t("clients.modal.ajout")}
            </h2>
            <form onSubmit={enregistrer} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("clients.form.nom")} *
                </label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("clients.form.contact")}
                  </label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) =>
                      setForm({ ...form, contact: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("clients.form.tel")}
                  </label>
                  <input
                    type="text"
                    value={form.telephone}
                    onChange={(e) =>
                      setForm({ ...form, telephone: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {editionId
                    ? t("clients.form.emailSimple")
                    : t("clients.form.email")}
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                />
              </div>

              {/* L'accès de connexion ne se crée qu'à la création du client */}
              {!editionId && (
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">
                    {t("clients.acces.title")}
                  </p>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("clients.acces.mdp")}
                  </label>
                  <input
                    type="password"
                    value={form.mot_de_passe}
                    onChange={(e) =>
                      setForm({ ...form, mot_de_passe: e.target.value })
                    }
                    minLength={4}
                    placeholder={t("clients.acces.placeholder")}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    {t("clients.acces.hint")}
                  </p>
                </div>
              )}

              {formErreur && (
                <p className="text-sm text-red-600">{formErreur}</p>
              )}

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
                    : editionId
                      ? t("common.enregistrer")
                      : t("clients.nouveau")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
