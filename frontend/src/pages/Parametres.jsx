// src/pages/Parametres.jsx — préférences de l'application (langue, compte).
import { useState, useEffect } from "react";
import { useLang } from "../i18n/LangContext";
import { useAuth } from "../auth/AuthContext";

const LANGUES = [
  { code: "fr", drapeau: "/france.png", nom: "Français" },
  { code: "en", drapeau: "/RU.png", nom: "English" },
];

export default function Parametres() {
  const { lang, setLang, t } = useLang();
  const { user, updateMe } = useAuth();

  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    email: "",
    mot_de_passe_actuel: "",
    nouveau_mot_de_passe: "",
  });
  const [saving, setSaving] = useState(false);
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState("");

  // Pré-remplit le formulaire dès que l'utilisateur est chargé.
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        nom: user.nom || "",
        prenom: user.prenom || "",
        email: user.email || "",
      }));
    }
  }, [user]);

  const onChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setSucces(false);
    setErreur("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setSucces(false);
    setSaving(true);
    try {
      // On n'envoie le mot de passe que si un nouveau est saisi.
      const payload = {
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
      };
      if (form.nouveau_mot_de_passe) {
        payload.mot_de_passe_actuel = form.mot_de_passe_actuel;
        payload.nouveau_mot_de_passe = form.nouveau_mot_de_passe;
      }
      await updateMe(payload);
      setSucces(true);
      setForm((f) => ({ ...f, mot_de_passe_actuel: "", nouveau_mot_de_passe: "" }));
    } catch (err) {
      setErreur(
        err?.response?.data?.detail || "Une erreur est survenue. Réessayez.",
      );
    } finally {
      setSaving(false);
    }
  };

  const champStyle =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#00B2A0] focus:ring-1 focus:ring-[#00B2A0]";

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        {t("settings.title")}
      </h1>
      <p className="mb-6 text-sm text-slate-500">{t("settings.subtitle")}</p>

      {/* Langue */}
      <section className="mb-6 rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-800">
          {t("settings.langue.title")}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {t("settings.langue.desc")}
        </p>

        <div className="flex flex-wrap gap-3">
          {LANGUES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${
                lang === l.code
                  ? "border-[#00B2A0] bg-[#00B2A0]/5 font-medium text-[#00B2A0]"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <img
                src={l.drapeau}
                alt={l.nom}
                className="h-5 w-5 rounded object-cover"
              />
              {l.nom}
              {lang === l.code && (
                <svg
                  className="h-4 w-4 text-[#00B2A0]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Compte — modifiable */}
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-800">
          {t("settings.compte.title")}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {t("settings.compte.modifier")} ·{" "}
          <span className="capitalize text-slate-600">{user?.role}</span>
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-500">
                {t("common.prenom")}
              </label>
              <input
                name="prenom"
                value={form.prenom}
                onChange={onChange}
                className={champStyle}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-500">
                {t("common.nom")}
              </label>
              <input
                name="nom"
                value={form.nom}
                onChange={onChange}
                className={champStyle}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-500">
              {t("common.email")}
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              className={champStyle}
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-3 text-xs text-slate-400">
              {t("settings.compte.mdpHint")}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-slate-500">
                  {t("settings.compte.mdpActuel")}
                </label>
                <input
                  type="password"
                  name="mot_de_passe_actuel"
                  value={form.mot_de_passe_actuel}
                  onChange={onChange}
                  autoComplete="current-password"
                  className={champStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-500">
                  {t("settings.compte.nouveauMdp")}
                </label>
                <input
                  type="password"
                  name="nouveau_mot_de_passe"
                  value={form.nouveau_mot_de_passe}
                  onChange={onChange}
                  autoComplete="new-password"
                  className={champStyle}
                />
              </div>
            </div>
          </div>

          {erreur && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {erreur}
            </p>
          )}
          {succes && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
              {t("settings.compte.succes")}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#00B2A0] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#009b8b] disabled:opacity-60"
            >
              {saving ? "…" : t("common.enregistrer")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
