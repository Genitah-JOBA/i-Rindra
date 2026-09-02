// src/pages/Membres.jsx — annuaire + gestion (CRUD) des membres avec leur métier (RF-02).
import { useEffect, useState } from "react";
import { utilisateursService } from "../api/utilisateurs";
import { useAuth } from "../auth/AuthContext";

const couleurRole = {
  direction: "bg-purple-100 text-purple-700",
  equipe: "bg-blue-100 text-blue-700",
  client: "bg-amber-100 text-amber-700",
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
  const estDirection = user?.role === "direction";

  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");

  // Modal (ajout / édition)
  const [modalOuvert, setModalOuvert] = useState(false);
  const [editionId, setEditionId] = useState(null); // null = ajout
  const [form, setForm] = useState(FORM_VIDE);
  const [formErreur, setFormErreur] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = async () => {
    setLoading(true);
    try {
      const data = await utilisateursService.list();
      setUtilisateurs(data || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur de chargement des membres.");
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
        // Modification : on n'envoie pas le mot de passe
        await utilisateursService.update(editionId, {
          nom: form.nom,
          prenom: form.prenom,
          email: form.email,
          role: form.role,
          metier: form.metier || null,
          actif: form.actif,
        });
      } else {
        // Ajout
        await utilisateursService.create({
          nom: form.nom,
          prenom: form.prenom,
          email: form.email,
          mot_de_passe: form.mot_de_passe,
          role: form.role,
          metier: form.metier || null,
        });
      }
      setModalOuvert(false);
      await charger();
    } catch (err) {
      setFormErreur(err.response?.data?.detail || "Erreur lors de l'enregistrement.");
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimer = async (u) => {
    if (!window.confirm(`Supprimer le compte de ${u.prenom} ${u.nom} ?`)) return;
    try {
      await utilisateursService.delete(u.id);
      setUtilisateurs((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      alert(err.response?.data?.detail || "Erreur lors de la suppression.");
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
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membres</h1>
          <p className="text-sm text-slate-500">
            Annuaire de l'équipe et de leurs métiers.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
          />
          {estDirection && (
            <button
              onClick={ouvrirAjout}
              className="rounded-md bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56]"
            >
              + Ajouter
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-slate-500">Chargement…</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtres.map((u) => (
            <div key={u.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00B2A0]/10 text-sm font-semibold text-[#00B2A0]">
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
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    couleurRole[u.role] || "bg-slate-100 text-slate-600"
                  }`}
                >
                  {u.role}
                </span>
                {u.metier && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {u.metier}
                  </span>
                )}
                {!u.actif && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600">
                    inactif
                  </span>
                )}
              </div>
              {estDirection && (
                <div className="mt-3 flex justify-end gap-2 border-t pt-2">
                  <button
                    onClick={() => ouvrirEdition(u)}
                    className="text-xs text-slate-500 hover:text-[#00B2A0]"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => supprimer(u)}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtres.length === 0 && (
            <p className="text-sm text-slate-500">Aucun membre trouvé.</p>
          )}
        </div>
      )}

      {/* MODAL AJOUT / ÉDITION */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editionId ? "Modifier le membre" : "Ajouter un membre"}
            </h2>
            <form onSubmit={enregistrer} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Prénom</label>
                  <input
                    type="text"
                    value={form.prenom}
                    onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Nom</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                />
              </div>

              {!editionId && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={form.mot_de_passe}
                    onChange={(e) => setForm({ ...form, mot_de_passe: e.target.value })}
                    required
                    minLength={4}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Rôle</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  >
                    <option value="direction">Direction</option>
                    <option value="equipe">Équipe</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Métier</label>
                  <input
                    type="text"
                    value={form.metier}
                    onChange={(e) => setForm({ ...form, metier: e.target.value })}
                    placeholder="développeur, graphiste…"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
                  />
                </div>
              </div>

              {editionId && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.actif}
                    onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                  />
                  Compte actif
                </label>
              )}

              {formErreur && <p className="text-sm text-red-600">{formErreur}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={enregistrement}
                  className="rounded-md bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56] disabled:opacity-50"
                >
                  {enregistrement ? "Enregistrement…" : editionId ? "Enregistrer" : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
