// src/pages/Absences.jsx — Disponibilités (absences, permissions, congés)
// Équipe / chef de projet : dépose une demande. Direction/DRH : l'accepte ou la refuse.
import { useEffect, useState } from "react";
import { absencesService } from "../api/absences";
import { useAuth } from "../auth/AuthContext";
import { useMessage } from "../context/MessageContext";
import "animate.css";

// Icônes SVG
const PlusIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const CloseIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const XIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CalendarIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
);

const FORM_VIDE = {
  type: "conge",
  date_debut: "",
  date_fin: "",
  motif: "",
};

const couleurStatut = {
  en_attente: "bg-amber-100 text-amber-700",
  acceptee: "bg-green-100 text-green-700",
  refusee: "bg-red-100 text-red-700",
};

const SECTIONS = [
  { id: "absence", label: "Absence", types: ["maladie", "autre"] },
  { id: "permission", label: "Permission", types: ["permission"] },
  { id: "conge", label: "Congé", types: ["conge"] },
];

export default function Absences() {
  const { user } = useAuth();
  const { showSuccess, showError } = useMessage();
  const estDirection = user?.role === "direction" || user?.role === "drh";

  const [absences, setAbsences] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [sectionActive, setSectionActive] = useState("absence");

  // Décision en cours (direction)
  const [demandeEnCours, setDemandeEnCours] = useState(null);
  const [commentaire, setCommentaire] = useState("");

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [liste, st] = await Promise.all([
        absencesService.list(),
        estDirection
          ? absencesService.stats().catch(() => null)
          : Promise.resolve(null),
      ]);
      setAbsences(liste || []);
      setStats(st);
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const formaterDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

  const ouvrirAjout = () => {
    setForm(FORM_VIDE);
    setFormErreur("");
    setModalOuvert(true);
  };

  const envoyer = async (ev) => {
    ev.preventDefault();
    setFormErreur("");
    setEnregistrement(true);
    try {
      await absencesService.create({
        type: form.type,
        date_debut: form.date_debut,
        date_fin: form.date_fin,
        motif: form.motif || null,
      });
      showSuccess("Demande d'absence envoyée !");
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

  const decider = async (absence, statut) => {
    if (!window.confirm(
      statut === "acceptee"
        ? "Accepter cette demande d'absence ?"
        : "Refuser cette demande d'absence ?",
    )) return;
    try {
      await absencesService.decide(absence.id, {
        statut,
        commentaire: commentaire || null,
      });
      showSuccess(statut === "acceptee" ? "Demande acceptée." : "Demande refusée.");
      setDemandeEnCours(null);
      setCommentaire("");
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de la décision.";
      showError(msg);
    }
  };

  const annuler = async (absence) => {
    if (!window.confirm("Annuler cette demande d'absence ?")) return;
    try {
      await absencesService.delete(absence.id);
      showSuccess("Demande annulée.");
      await charger();
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur lors de l'annulation.";
      showError(msg);
    }
  };

  const afficherStatut = (statut) => {
    const map = {
      en_attente: "En attente",
      acceptee: "Acceptée",
      refusee: "Refusée",
    };
    return map[statut] || statut;
  };

  const afficherType = (type) => {
    const map = {
      conge: "Congés",
      maladie: "Maladie",
      permission: "Permission",
      autre: "Autre",
    };
    return map[type] || type;
  };

  const statsCartes = stats
    ? [
        { label: "En attente", valeur: stats.en_attente, couleur: "border-[#d97706] text-[#d97706]" },
        { label: "Acceptées", valeur: stats.acceptees, couleur: "border-i-blue text-i-blue" },
        { label: "Refusées", valeur: stats.refusees, couleur: "border-red-500 text-red-600" },
        { label: "Total", valeur: stats.total, couleur: "border-slate-300 text-slate-700" },
      ]
    : [];

  const sectionCourante = SECTIONS.find((s) => s.id === sectionActive);
  const absencesDeSection = absences.filter((a) =>
    sectionCourante?.types.includes(a.type)
  );
  const afficherDemandeur = estDirection || user?.role === "chef_de_projet";

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8 py-2">
      {/* En-tête : alignement vertical sur mobile, horizontal sur desktop */}
      <div className="mb-8 flex flex-col gap-4 animate__animated animate__fadeInDown sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {"Disponibilités"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {"Absences, permissions et congés."}
          </p>
        </div>
        {!estDirection && (
          <button
            onClick={ouvrirAjout}
            className="flex w-full items-center justify-center gap-2 bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:brightness-110 hover:shadow-md sm:w-auto"
          >
            <PlusIcon className="w-4 h-4" />
            { "Nouvelle demande"}
          </button>
        )}
      </div>

      {/* Stats direction : grille responsive avec cartes alignées */}
      {estDirection && stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statsCartes.map((c, i) => (
            <div
              key={c.label}
              className={`flex flex-col items-center justify-center border-t-4 bg-white p-5 text-center shadow-sm transition hover:shadow-md animate__animated animate__fadeInUp ${c.couleur.split(" ")[0]}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <p className="text-3xl font-bold text-slate-900">{c.valeur}</p>
              <p className={`mt-1 text-xs font-medium ${c.couleur.split(" ")[1]}`}>
                {c.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center py-12 animate__animated animate__pulse">
          <div className="animate-spin h-8 w-8 border-b-2 border-i-blue"></div>
          <span className="ml-3 text-slate-500">{"Chargement…"}</span>
        </div>
      )}
      {erreur && (
        <div className="mb-4 bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 animate__animated animate__shakeX">
          ⚠️ {erreur}
        </div>
      )}

      {!loading && !erreur && (
        <>
          {/* Barre des sections : centrée, pills modernes */}
          <div className="mb-5 flex flex-wrap justify-center gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSectionActive(s.id)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all duration-200 ${
                  sectionActive === s.id
                    ? "bg-slate-800 text-white shadow-md scale-105"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:shadow-sm"
                }`}
              >
                {s.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    sectionActive === s.id ? "bg-white/20" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {absences.filter((a) => s.types.includes(a.type)).length}
                </span>
              </button>
            ))}
          </div>

          {absencesDeSection.length > 0 ? (
            <div className="space-y-3">
              {absencesDeSection.map((a, index) => (
                <div
                  key={a.id}
                  className="border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300 animate__animated animate__fadeInUp"
                  style={{ animationDelay: `${index * 0.04}s` }}
                >
                  {/* Disposition : contenu à gauche, actions à droite (empilé sur mobile) */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Demandeur */}
                      {afficherDemandeur && (
                        <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                          <span className="flex h-7 w-7 items-center justify-center bg-i-blue/10 text-xs font-semibold text-i-blue">
                            {a.utilisateur_prenom?.charAt(0)}
                            {a.utilisateur_nom?.charAt(0)}
                          </span>
                          {a.utilisateur_prenom} {a.utilisateur_nom}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          {afficherType(a.type)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {formaterDate(a.date_debut)} → {formaterDate(a.date_fin)}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 text-xs font-medium ${
                            couleurStatut[a.statut] || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {afficherStatut(a.statut)}
                        </span>
                      </div>

                      {a.motif && (
                        <p className="mt-2 text-sm text-slate-600">« {a.motif} »</p>
                      )}

                      {a.commentaire && (
                        <p className="mt-1 text-xs italic text-slate-500">
                          {"Décidé par"} : {a.decideur_nom} — {a.commentaire}
                        </p>
                      )}
                    </div>

                    {/* Actions : alignées à droite, empilées sur mobile */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      {estDirection && a.statut === "en_attente" && (
                        <>
                          {demandeEnCours === a.id && (
                            <input
                              type="text"
                              value={commentaire}
                              onChange={(e) => setCommentaire(e.target.value)}
                              placeholder={"Commentaire (optionnel)"}
                              className="w-full border border-slate-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-i-blue focus:border-transparent sm:w-44"
                            />
                          )}
                          <button
                            onClick={() =>
                              demandeEnCours === a.id
                                ? setDemandeEnCours(null)
                                : setDemandeEnCours(a.id)
                            }
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            {"Décision"}
                          </button>
                          {demandeEnCours === a.id && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => decider(a, "acceptee")}
                                className="flex items-center gap-1 bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
                              >
                                <CheckIcon className="w-3.5 h-3.5" />
                                {"Accepter"}
                              </button>
                              <button
                                onClick={() => decider(a, "refusee")}
                                className="flex items-center gap-1 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700"
                              >
                                <XIcon className="w-3.5 h-3.5" />
                                {"Refuser"}
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {!estDirection && a.statut === "en_attente" && a.utilisateur_id === user?.id && (
                        <button
                          onClick={() => annuler(a)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          {"Annuler la demande"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* État vide : centrage vertical et horizontal */
            <div className="flex flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
              <CalendarIcon className="w-14 h-14 text-slate-300 mb-4" />
              <p className="text-sm text-slate-500 max-w-md">
                {estDirection
                  ? sectionActive === "absence"
                    ? "Aucune demande d'absence pour le moment."
                    : `Aucune demande de ${sectionCourante?.label} pour le moment.`
                  : sectionActive === "absence"
                    ? "Vous n'avez aucune demande d'absence."
                    : `Vous n'avez aucune demande de ${sectionCourante?.label}.`}
              </p>
              {!estDirection && (
                <button
                  onClick={ouvrirAjout}
                  className="mt-5 bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-i-primary shadow-sm hover:brightness-110 transition"
                >
                  { "+ Nouvelle demande"}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL NOUVELLE DEMANDE (équipe) */}
      {!estDirection && modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-md bg-white p-6 shadow-2xl animate__animated animate__zoomIn">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {"Nouvelle demande d'absence"}
              </h2>
              <button
                onClick={() => setModalOuvert(false)}
                className="p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={envoyer} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  {"Type"} <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-i-blue focus:border-transparent appearance-none bg-white"
                >
                  <option value="conge">{"Congés"}</option>
                  <option value="maladie">{"Maladie"}</option>
                  <option value="permission">{"Permission"}</option>
                  <option value="autre">{"Autre"}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    {"Date de début"} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date_debut}
                    onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
                    required
                    className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-i-blue focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    {"Date de fin"} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.date_fin}
                    onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
                    required
                    className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-i-blue focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  {"Motif"}
                </label>
                <input
                  type="text"
                  value={form.motif}
                  onChange={(e) => setForm({ ...form, motif: e.target.value })}
                  placeholder={"Indiquez le motif…"}
                  className="w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-i-blue focus:border-transparent"
                />
              </div>

              {formErreur && (
                <div className="bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
                  ⚠️ {formErreur}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-3 border-t border-slate-200 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {"Annuler"}
                </button>
                <button
                  type="submit"
                  disabled={enregistrement}
                  className="bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:brightness-110 disabled:opacity-50"
                >
                  {enregistrement
                    ? "Enregistrement…"
                    : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}