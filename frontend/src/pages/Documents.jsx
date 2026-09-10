// Documents.jsx — espace client : documents partagés par projet (RF-08).
import { useEffect, useState } from "react";
import api from "../api/client";
import { fichiersService } from "../api/fichiers";
import { useLang } from "../i18n/LangContext";
import "animate.css";

const infoType = (mime) => {
  if (!mime) return { label: "FIC", classe: "bg-slate-100 text-slate-600" };
  const m = mime.toLowerCase();
  if (m === "application/pdf")
    return { label: "PDF", classe: "bg-red-100 text-red-700" };
  if (m.startsWith("image/"))
    return { label: "IMG", classe: "bg-purple-100 text-purple-700" };
  if (m.includes("word"))
    return { label: "DOC", classe: "bg-blue-100 text-blue-700" };
  if (m.includes("excel") || m === "text/csv")
    return { label: "XLS", classe: "bg-green-100 text-green-700" };
  if (m.includes("powerpoint"))
    return { label: "PPT", classe: "bg-orange-100 text-orange-700" };
  if (m.includes("zip") || m.includes("rar"))
    return { label: "ZIP", classe: "bg-amber-100 text-amber-700" };
  if (m.startsWith("text/"))
    return { label: "TXT", classe: "bg-slate-100 text-slate-600" };
  return { label: "FIC", classe: "bg-slate-100 text-slate-600" };
};

const formatTaille = (octets) => {
  if (octets == null) return "—";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  if (octets < 1024 * 1024 * 1024)
    return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(octets / (1024 * 1024 * 1024)).toFixed(2)} Go`;
};

export default function Documents() {
  const { t } = useLang();
  const [projets, setProjets] = useState([]);
  const [fichiersParProjet, setFichiersParProjet] = useState({});
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  const chargerDonnees = async () => {
    setLoading(true);
    setErreur("");
    try {
      const { data } = await api.get("/client/projets");
      setProjets(data || []);
      const decharges = await Promise.all(
        (data || []).map(async (p) => {
          const fichiers = await fichiersService
            .listByProjet(p.id)
            .catch(() => []);
          return [p.id, fichiers || []];
        }),
      );
      setFichiersParProjet(Object.fromEntries(decharges));
    } catch (err) {
      setErreur(err.response?.data?.detail || t("mp.aucun"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerDonnees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const telecharger = async (projetId, f) => {
    try {
      await fichiersService.telecharger(projetId, f.id, f.nom);
    } catch (err) {
      alert(
        err.response?.data?.detail || "Impossible de télécharger ce document.",
      );
    }
  };

  const fmtDate = (dateStr) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString(
          navigator.language?.startsWith("en") ? "en-GB" : "fr-FR",
        )
      : "—";

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#63B23E]"></div>
        <span className="ml-3 text-slate-500">{t("common.chargement")}</span>
      </div>
    );

  if (erreur)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {erreur}
      </div>
    );

  const nbFichiers = Object.values(fichiersParProjet).reduce(
    (acc, liste) => acc + (liste?.length || 0),
    0,
  );

  return (
    <div className="animate__animated animate__fadeIn w-full">
      {/* En-tête */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {t("nav.documents")}
          </h1>
          <p className="text-sm text-slate-500">{t("docs.sousTitre")}</p>
        </div>
        <button
          onClick={chargerDonnees}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-[#63B23E] text-white hover:bg-[#3F894E] transition-colors disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          {t("dash.refresh")}
        </button>
      </div>

      {projets.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">{t("mp.aucun")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {projets.map((projet, index) => {
            const fichiers = fichiersParProjet[projet.id] || [];
            return (
              <div
                key={projet.id}
                className="animate__animated animate__fadeInUp bg-white border border-slate-200 shadow-sm"
                style={{ animationDelay: `${0.05 + index * 0.05}s` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4 text-slate-400 flex-shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                      />
                    </svg>
                    <h3 className="text-sm font-semibold text-slate-900 truncate">
                      {projet.nom}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    {fichiers.length} {t("docs.fichiers")}
                  </span>
                </div>

                {fichiers.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">
                    {t("docs.vide")}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {fichiers.map((f) => {
                      const info = infoType(f.type_mime);
                      return (
                        <div
                          key={f.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className={`shrink-0 px-2 py-1 text-[10px] font-bold ${info.classe}`}
                            >
                              {info.label}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {f.nom}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatTaille(f.taille_octets)}
                                {f.cree_le && ` · ${fmtDate(f.cree_le)}`}
                                {f.televerse_par_nom &&
                                  ` · ${f.televerse_par_nom}`}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => telecharger(projet.id, f)}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#63B23E] hover:text-[#3F894E] transition-colors"
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
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                              />
                            </svg>
                            {t("docs.telecharger")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {projets.length > 0 && nbFichiers === 0 && (
        <div className="mt-6 rounded border-l-4 border-l-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {t("docs.aucunDocument")}
        </div>
      )}
    </div>
  );
}