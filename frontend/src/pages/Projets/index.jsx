// src/pages/Projets/index.jsx — liste + création de projets (RF-05, RF-06).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { projetsService } from "../../api/projets";
import { clientsService } from "../../api/client";
import { utilisateursService } from "../../api/utilisateurs";

const couleurStatut = {
  vert: "bg-green-100 text-green-800",
  orange: "bg-orange-100 text-orange-800",
  rouge: "bg-red-100 text-red-800",
};

const FORM_VIDE = {
  nom: "",
  description: "",
  client_id: "",
  responsable_id: "",
  date_debut: "",
  date_fin_prevue: "",
};

export default function Projets() {
  const navigate = useNavigate();

  const [projets, setProjets] = useState([]);
  const [clients, setClients] = useState([]);
  const [responsables, setResponsables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    charger();
  }, []);

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [projetsData, clientsData, usersData] = await Promise.all([
        projetsService.list(),
        clientsService.list().catch(() => []),
        utilisateursService.list().catch(() => []),
      ]);
      setProjets(projetsData || []);
      setClients(clientsData || []);
      // Le responsable d'un projet est obligatoirement un membre de la direction
      setResponsables((usersData || []).filter((u) => u.role === "direction"));
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur de chargement des projets.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErreur("");
    if (!form.nom.trim()) return setFormErreur("Le nom du projet est requis.");
    if (!form.client_id) return setFormErreur("Veuillez choisir un client.");
    if (!form.responsable_id)
      return setFormErreur("Veuillez choisir un responsable.");

    setEnCours(true);
    try {
      await projetsService.create({
        nom: form.nom,
        description: form.description || null,
        client_id: parseInt(form.client_id, 10),
        responsable_id: parseInt(form.responsable_id, 10),
        date_debut: form.date_debut || null,
        date_fin_prevue: form.date_fin_prevue || null,
      });
      setModalOuvert(false);
      setForm(FORM_VIDE);
      await charger();
    } catch (err) {
      setFormErreur(
        err.response?.data?.detail || "Erreur lors de la création du projet."
      );
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async (projet, e) => {
    e.stopPropagation(); // ne pas déclencher la navigation vers la fiche
    if (
      !window.confirm(
        `Supprimer définitivement le projet « ${projet.nom} » ?\nSes tâches, jalons et membres seront aussi supprimés.`
      )
    )
      return;
    try {
      await projetsService.remove(projet.id);
      setProjets((prev) => prev.filter((p) => p.id !== projet.id));
    } catch (err) {
      alert(
        err.response?.data?.detail || "Erreur lors de la suppression du projet."
      );
    }
  };

  const nomClient = (id) => clients.find((c) => c.id === id)?.nom || "—";

  return (
    <div>
      {/* En-tête */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projets</h1>
          <p className="text-sm text-slate-500">
            {projets.length} projet{projets.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            setForm(FORM_VIDE);
            setFormErreur("");
            setModalOuvert(true);
          }}
          className="rounded-lg bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56]"
        >
          + Nouveau projet
        </button>
      </div>

      {loading && <p className="text-slate-500">Chargement…</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && projets.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-slate-500">
          Aucun projet. Cliquez sur « Nouveau projet » pour commencer.
        </div>
      )}

      {/* Grille des projets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projets.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/projets/${p.id}`)}
            className="group relative cursor-pointer rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            {/* Bouton supprimer (apparaît au survol) */}
            <button
              onClick={(e) => supprimer(p, e)}
              title="Supprimer le projet"
              className="absolute right-2 top-2 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>

            <div className="mb-2 flex items-start justify-between gap-2 pr-6">
              <h2 className="font-semibold text-slate-900">{p.nom}</h2>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                  couleurStatut[p.statut_sante] || "bg-slate-100 text-slate-700"
                }`}
              >
                {p.statut_sante}
              </span>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Client : {nomClient(p.client_id)}
            </p>
            <div className="mb-1 h-2 w-full overflow-hidden rounded bg-slate-100">
              <div
                className="h-full bg-[#00B2A0]"
                style={{ width: `${p.avancement_pct || 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">{p.avancement_pct || 0}% terminé</p>
          </div>
        ))}
      </div>

      {/* Modal création */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Nouveau projet</h2>
              <button
                onClick={() => setModalOuvert(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {formErreur && (
              <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {formErreur}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nom *
                </label>
                <input
                  name="nom"
                  value={form.nom}
                  onChange={handleChange}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  placeholder="Site vitrine…"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Client *
                  </label>
                  <select
                    name="client_id"
                    value={form.client_id}
                    onChange={handleChange}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  >
                    <option value="">— Choisir —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Responsable *
                  </label>
                  <select
                    name="responsable_id"
                    value={form.responsable_id}
                    onChange={handleChange}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  >
                    <option value="">— Choisir —</option>
                    {responsables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.prenom} {r.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Début
                  </label>
                  <input
                    type="date"
                    name="date_debut"
                    value={form.date_debut}
                    onChange={handleChange}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Fin prévue
                  </label>
                  <input
                    type="date"
                    name="date_fin_prevue"
                    value={form.date_fin_prevue}
                    onChange={handleChange}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
              </div>

              {clients.length === 0 && (
                <p className="text-xs text-orange-600">
                  Aucun client disponible — créez d'abord un client.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={enCours}
                  className="rounded-md bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#074E56] disabled:opacity-50"
                >
                  {enCours ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
