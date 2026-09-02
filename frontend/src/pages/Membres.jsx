// src/pages/Membres.jsx — annuaire de tous les utilisateurs (RF-02).
import { useEffect, useState } from "react";
import { utilisateursService } from "../api/utilisateurs";

const couleurRole = {
  direction: "bg-purple-100 text-purple-700",
  equipe: "bg-blue-100 text-blue-700",
  client: "bg-amber-100 text-amber-700",
};

export default function Membres() {
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    utilisateursService
      .list()
      .then((data) => setUtilisateurs(data || []))
      .catch((err) =>
        setErreur(err.response?.data?.detail || "Erreur de chargement des membres.")
      )
      .finally(() => setLoading(false));
  }, []);

  const filtres = utilisateurs.filter((u) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      `${u.prenom} ${u.nom}`.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
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
            Annuaire de tous les comptes de la plateforme.
          </p>
        </div>
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher…"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
        />
      </div>

      {loading && <p className="text-slate-500">Chargement…</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtres.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00B2A0]/10 text-sm font-semibold text-[#00B2A0]">
                {initiales(u)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">
                  {u.prenom} {u.nom}
                </p>
                <p className="truncate text-xs text-slate-500">{u.email}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      couleurRole[u.role] || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {u.role}
                  </span>
                  {!u.actif && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600">
                      inactif
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtres.length === 0 && (
            <p className="text-sm text-slate-500">Aucun membre trouvé.</p>
          )}
        </div>
      )}
    </div>
  );
}
