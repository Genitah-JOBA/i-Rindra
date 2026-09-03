// src/pages/Clients.jsx — annuaire + gestion (CRUD) des clients (uniquement les clients)
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
  role: "client", // ← Par défaut "client"
  metier: "",
  actif: true,
};

export default function Clients() {
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
      // ✅ FILTRE : Garder uniquement les clients (rôle === "client")
      const clients = (data || []).filter(u => u.role === "client");
      setUtilisateurs(clients);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Erreur de chargement des clients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const ouvrirAjout = () => {
    setEditionId(null);
    setForm({ ...FORM_VIDE, role: "client" });
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
      role: "client", // Toujours client
      metier: u.metier || "",
      actif: u.actif !== undefined ? u.actif : true,
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
          role: "client", // Forcé à "client"
          metier: form.metier || null,
          actif: form.actif,
        });
      } else {
        // Ajout - toujours avec rôle "client"
        await utilisateursService.create({
          nom: form.nom,
          prenom: form.prenom,
          email: form.email,
          mot_de_passe: form.mot_de_passe,
          role: "client", // Forcé à "client"
          metier: form.metier || null,
        });
      }
      setModalOuvert(false);
      await charger(); // Recharge la liste des clients
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
      u.metier?.toLowerCase().includes(q)
    );
  });

  const initiales = (u) =>
    `${u.prenom?.charAt(0) || ""}${u.nom?.charAt(0) || ""}`.toUpperCase();

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900">
            Clients
          </h1>
          <p className="text-sm text-slate-500">
            Annuaire des clients de l'agence.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client…"
            className="border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
          />
          {estDirection && (
            <button
              onClick={ouvrirAjout}
              className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white rounded-md transition hover:bg-[#3F894E]"
            >
              + Ajouter un client
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-slate-500">Chargement des clients…</p>}
      {erreur && <p className="text-red-600">⚠️ {erreur}</p>}

      {!loading && !erreur && (
        <>
          {filtres.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtres.map((u) => (
                <div key={u.id} className="border border-slate-200 bg-white p-4 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#63B23E]/10 text-sm font-semibold text-[#63B23E] rounded-full">
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
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                        couleurRole[u.role] || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {u.role === "client" ? "Client" : u.role}
                    </span>
                    {u.metier && (
                      <span className="bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 rounded-full">
                        {u.metier}
                      </span>
                    )}
                    {!u.actif && (
                      <span className="bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600 rounded-full">
                        inactif
                      </span>
                    )}
                  </div>
                  {estDirection && (
                    <div className="mt-3 flex justify-end gap-2 border-t pt-2">
                      <button
                        onClick={() => ouvrirEdition(u)}
                        className="text-xs text-slate-500 hover:text-[#63B23E] transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => supprimer(u)}
                        className="text-xs text-slate-500 hover:text-red-600 transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-slate-500">Aucun client trouvé.</p>
              {estDirection && (
                <button
                  onClick={ouvrirAjout}
                  className="mt-4 px-4 py-2 bg-[#63B23E] text-white rounded-md hover:bg-[#3F894E] transition-colors"
                >
                  + Ajouter un client
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL AJOUT / ÉDITION */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
          <div className="w-full max-w-md bg-white p-6 shadow-xl rounded-lg animate__animated animate__zoomIn">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {editionId ? "Modifier le client" : "Ajouter un client"}
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
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Nom</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    required
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
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
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
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
                    className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Métier</label>
                <input
                  type="text"
                  value={form.metier}
                  onChange={(e) => setForm({ ...form, metier: e.target.value })}
                  placeholder="Ex: Directeur, Gérant..."
                  className="w-full border border-slate-300 px-3 py-2 text-sm outline-none rounded-md focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
                />
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

              {formErreur && <p className="text-sm text-red-600">⚠️ {formErreur}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="border border-slate-300 px-4 py-2 text-sm text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={enregistrement}
                  className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white rounded-md transition hover:bg-[#3F894E] disabled:opacity-50"
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