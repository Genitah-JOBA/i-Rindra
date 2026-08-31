// MonProjet.jsx — espace client : le client ne voit QUE son projet (RF-19, RF-22).
import { useEffect, useState } from "react";
import api from "../api/client";

export default function MonProjet() {
  const [projet, setProjet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    api
      .get("/client/mon-projet")
      .then((res) => setProjet(res.data))
      .catch((err) =>
        setErreur(
          err.response?.data?.detail || "Aucun projet trouvé pour votre compte."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Chargement…</p>;
  if (erreur) return <p className="text-red-600">{erreur}</p>;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">Mon projet</h1>
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{projet.nom}</h2>
        <p className="mb-4 text-sm text-slate-500">{projet.description}</p>
        <div className="mb-1 h-2 w-full overflow-hidden rounded bg-slate-100">
          <div
            className="h-full bg-slate-800"
            style={{ width: `${projet.avancement_pct || 0}%` }}
          />
        </div>
        <p className="text-xs text-slate-500">
          {projet.avancement_pct || 0}% terminé · statut {projet.statut_sante}
        </p>
      </div>
    </div>
  );
}
