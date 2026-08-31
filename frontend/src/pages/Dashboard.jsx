// Dashboard.jsx — vue d'accueil interne (RF-16). Base : liste des projets.
import { useEffect, useState } from "react";
import { projetsService } from "../api/projets";
import { useAuth } from "../auth/AuthContext";

const couleurStatut = {
  vert: "bg-green-100 text-green-800",
  orange: "bg-orange-100 text-orange-800",
  rouge: "bg-red-100 text-red-800",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    projetsService
      .list()
      .then((data) => setProjets(data))
      .catch((err) =>
        setErreur(err.response?.data?.detail || "Erreur de chargement.")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        Bonjour {user?.prenom} {user?.nom} !
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Voici l'ensemble des projets.
      </p>

      {loading && <p className="text-slate-500">Chargement des projets…</p>}
      {erreur && <p className="text-red-600">{erreur}</p>}

      {!loading && !erreur && projets.length === 0 && (
        <p className="text-slate-500">Aucun projet pour le moment.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projets.map((p) => (
          <div key={p.id} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <h2 className="font-semibold text-slate-900">{p.nom}</h2>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  couleurStatut[p.statut_sante] || "bg-slate-100 text-slate-700"
                }`}
              >
                {p.statut_sante}
              </span>
            </div>
            <div className="mb-1 h-2 w-full overflow-hidden rounded bg-slate-100">
              <div
                className="h-full bg-slate-800"
                style={{ width: `${p.avancement_pct || 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {p.avancement_pct || 0}% terminé
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
