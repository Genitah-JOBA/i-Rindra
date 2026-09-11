// src/pages/Membres.jsx — annuaire + gestion (CRUD) des membres avec leur métier (RF-02).
import { useEffect, useState } from "react";
import { utilisateursService } from "../api/utilisateurs";
import { useAuth } from "../auth/AuthContext";
import { useLang } from "../i18n/LangContext";
import { useMessage } from "../context/MessageContext";
import 'animate.css';

// Icônes SVG
const PlusIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const EditIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

const SearchIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const CloseIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UserIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const couleurRole = {
  direction: "bg-purple-100 text-purple-700",
  drh: "bg-rose-100 text-rose-700",
  equipe: "bg-blue-100 text-blue-700",
  client: "bg-amber-100 text-amber-700",
};

const labelRole = {
  direction: "Direction",
  drh: "DRH",
  equipe: "Équipe",
  client: "Client",
};

const FORM_VIDE = {
  nom: "",
  prenom: "",
  email: "",
  mot_de_passe: "",
  role: "equipe",
  metier: "",
  actif: true,
};

export default function Membres() {
  const { user } = useAuth();
  const { t } = useLang();
  const { showSuccess, showError } = useMessage();
  const estGestion = user?.role === "admin" || user?.role === "direction";

  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");

  // Modal (ajout / édition)
  const [modalOuvert, setModalOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirmSuppression, setConfirmSuppression] = useState(null);

  const charger = async () => {
    setLoading(true);
    try {
      const data = await utilisateursService.list();
      setUtilisateurs((data || []).filter((u) => u.role !== "client"));
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement des membres.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const ouvrirAjout = () => {
    setEditionId(null);
    setForm(FORM_VIDE);
    setFormErreur("");
    setModalOuvert(true);
  };

  const ouvrirEdition = (u) => {
    setEditionId(u.id);
    setForm({
      nom: u.nom,
      prenom: u.prenom,
      email: u.email,
      mot_de_passe: "",
      role: u.role,
      metier: u.metier || "",
      actif: u.actif,
    });
    setFormErreur("");
    setModalOuvert(true);
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setFormErreur("");
    setEnregistrement(true);
    try {
      if (editionId) {
        await utilisateursService.update(editionId, {
          nom: form.nom,
          prenom: form.prenom,
          email: form.email,
          role: form.role,
          metier: form.metier || null,
          actif: form.actif,
        });
        showSuccess("Membre modifié avec succès !");
      } else {
        await utilisateursService.create({
          nom: form.nom,
          prenom: form.prenom,
          email: form.email,
          mot_de_passe: form.mot_de_passe,
          role: form.role,
          metier: form.metier || null,
        });
        showSuccess("Membre ajouté avec succès !");
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

  // SUPPRESSION
  const demanderSuppression = (u) => {
    setConfirmSuppression(u);
  };

  const confirmerSuppression = async () => {
    if (!confirmSuppression) return;
    const u = confirmSuppression;
    setConfirmSuppression(null);
    try {
      await utilisateursService.delete(u.id);
      setUtilisateurs((prev) => prev.filter((x) => x.id !== u.id));
      showSuccess(`Membre "${u.prenom} ${u.nom}" supprimé.`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de la suppression.";
      showError(msg);
    }
  };

  const filtres = utilisateurs.filter((u) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      `${u.prenom} ${u.nom}`.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.metier?.toLowerCase().includes(q)
    );
  });

  const initiales = (u) =>
    `${u.prenom?.charAt(0) || ""}${u.nom?.charAt(0) || ""}`.toUpperCase();

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 animate__animated animate__fadeInDown">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t("membres.titre")}
          </h1>
          <p className="text-sm text-slate-500">
            {utilisateurs.length} {t("membres.sousTitre")}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <input
              type="text"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={t("common.rechercher")}
              className="w-48 sm:w-56 pl-8 pr-3 py-2 text-sm border border-slate-300  outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
            />
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
          {estGestion && (
            <button
              onClick={ouvrirAjout}
              className="flex items-center gap-2 bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white  transition hover:bg-[#4a8f2e]"
            >
              <PlusIcon className="w-4 h-4" />
              {t("common.ajouter")}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12 animate__animated animate__pulse">
          <div className="animate-spin  h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">{t("common.chargement")}</span>
        </div>
      )}
      {erreur && (
        <div className="mb-4  bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 animate__animated animate__shakeX">
          ⚠️ {erreur}
        </div>
      )}

      {!loading && !erreur && (
        <>
          {filtres.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtres.map((u, index) => (
                <div
                  key={u.id}
                  className="border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-[#63B23E] transition-all duration-300  animate__animated animate__fadeInUp"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#63B23E]/10 text-sm font-semibold text-[#63B23E] ">
                      {initiales(u)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">
                        {u.prenom} {u.nom}
                      </p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-medium  ${
                        couleurRole[u.role] || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {labelRole[u.role] || u.role}
                    </span>
                    {u.metier && (
                      <span className="bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 ">
                        {u.metier}
                      </span>
                    )}
                    {!u.actif && (
                      <span className="bg-red-100 px-2 py-0.5 text-[10px] text-red-600 ">
                        {t("common.inactif")}
                      </span>
                    )}
                  </div>
                  {estGestion && (
                    <div className="mt-3 flex justify-end gap-3 border-t border-slate-100 pt-2">
                      <button
                        onClick={() => ouvrirEdition(u)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#63B23E] transition-colors"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                        {t("common.modifier")}
                      </button>
                      <button
                        onClick={() => demanderSuppression(u)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition-colors"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        {t("common.supprimer")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-300 ">
              <UserIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">{t("membres.vide")}</p>
              {estGestion && (
                <button
                  onClick={ouvrirAjout}
                  className="mt-4 px-4 py-2 bg-[#63B23E] text-white  hover:bg-[#4a8f2e] transition-colors"
                >
                  + {t("common.ajouter")}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL AJOUT / ÉDITION */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-md bg-white p-6 shadow-xl  animate__animated animate__zoomIn">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editionId
                  ? t("membres.modal.edition")
                  : t("membres.modal.ajout")}
              </h2>
              <button
                onClick={() => setModalOuvert(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={enregistrer} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("common.prenom")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.prenom}
                    onChange={(e) =>
                      setForm({ ...form, prenom: e.target.value })
                    }
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none  focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("common.nom")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none  focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  {t("common.email")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none  focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                />
              </div>

              {!editionId && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Mot de passe <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.mot_de_passe}
                    onChange={(e) =>
                      setForm({ ...form, mot_de_passe: e.target.value })
                    }
                    required
                    minLength={4}
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none  focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("common.role")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none  focus:ring-2 focus:ring-[#63B23E] focus:border-transparent appearance-none bg-white"
                  >
                    <option value="direction">Direction</option>
                    <option value="admin">DRH</option>
                    <option value="equipe">Équipe</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {t("common.metier")}
                  </label>
                  <input
                    type="text"
                    value={form.metier}
                    onChange={(e) =>
                      setForm({ ...form, metier: e.target.value })
                    }
                    placeholder="développeur, graphiste…"
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none  focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
              </div>

              {editionId && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.actif}
                    onChange={(e) =>
                      setForm({ ...form, actif: e.target.checked })
                    }
                    className="accent-[#63B23E]"
                  />
                  {t("common.actif")}
                </label>
              )}

              {formErreur && (
                <div className=" bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  ⚠️ {formErreur}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100  transition-colors"
                >
                  {t("common.annuler")}
                </button>
                <button
                  type="submit"
                  disabled={enregistrement}
                  className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white  transition hover:bg-[#4a8f2e] disabled:opacity-50"
                >
                  {enregistrement
                    ? t("common.enregistrement")
                    : editionId
                      ? t("common.enregistrer")
                      : t("common.ajouter")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MESSAGEBOX SUPPRESSION */}
      {confirmSuppression && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-sm bg-white p-6 shadow-xl animate__animated animate__zoomIn">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-red-100 text-red-600">
                <TrashIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Confirmer la suppression
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Voulez-vous vraiment supprimer le compte de{" "}
                  <span className="font-medium text-slate-700">
                    {confirmSuppression.prenom} {confirmSuppression.nom}
                  </span>{" "}
                  ? Cette action est irréversible.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmSuppression(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {t("common.annuler")}
              </button>
              <button
                type="button"
                onClick={confirmerSuppression}
                className="bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                {t("common.supprimer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}