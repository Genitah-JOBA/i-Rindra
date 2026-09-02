// src/pages/ProjetDetail/index.jsx — fiche d'un projet : infos + gestion des membres (RF-06, RF-13).
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { projetsService } from "../../api/projets";

const couleurStatut = {
  vert: "bg-green-100 text-green-800",
  orange: "bg-orange-100 text-orange-800",
  rouge: "bg-red-100 text-red-800",
};

const couleurRoleGlobal = {
  direction: "bg-purple-100 text-purple-700",
  equipe: "bg-blue-100 text-blue-700",
  client: "bg-amber-100 text-amber-700",
};

export default function ProjetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [projet, setProjet] = useState(null);
  const [membres, setMembres] = useState([]);
  const [disponibles, setDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  // Formulaire d'ajout de membre
  const [nouvelUtilisateurId, setNouvelUtilisateurId] = useState("");
  const [roleDansProjet, setRoleDansProjet] = useState("");
  const [ajoutErreur, setAjoutErreur] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur("");
    try {
      const [p, m, dispo] = await Promise.all([
        projetsService.get(id),
        projetsService.getMembres(id).catch(() => []),
        projetsService.getMembresDisponibles(id).catch(() => []),
      ]);
      setProjet(p);
      setMembres(m || []);
      setDisponibles(dispo || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Projet introuvable.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const ajouterMembre = async (e) => {
    e.preventDefault();
    setAjoutErreur("");
    if (!nouvelUtilisateurId) {
      setAjoutErreur("Choisissez un utilisateur.");
      return;
    }
    setAjoutEnCours(true);
    try {
      await projetsService.addMembre(id, {
        utilisateur_id: parseInt(nouvelUtilisateurId, 10),
        role_dans_projet: roleDansProjet || null,
      });
      setNouvelUtilisateurId("");
      setRoleDansProjet("");
      await charger(); // recharge membres + disponibles
    } catch (err) {
      setAjoutErreur(err.response?.data?.detail || "Erreur lors de l'ajout.");
    } finally {
      setAjoutEnCours(false);
    }
  };

  const retirerMembre = async (membre) => {
    if (!window.confirm(`Retirer ${membre.prenom} ${membre.nom} du projet ?`)) return;
    try {
      await projetsService.removeMembre(id, membre.utilisateur_id);
      await charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Impossible de retirer ce membre.");
    }
  };

  const supprimerProjet = async () => {
    if (!window.confirm(`Supprimer définitivement le projet « ${projet.nom} » ?`)) return;
    try {
      await projetsService.remove(id);
      navigate("/projets");
    } catch (err) {
      alert(err.response?.data?.detail || "Erreur lors de la suppression.");
    }
  };

  if (loading) return <p className="text-slate-500">Chargement…</p>;
  if (erreur)
    return (
      <div>
        <Link to="/projets" className="text-sm text-[#00B2A0] hover:underline">
          ← Retour aux projets
        </Link>
        <p className="mt-4 text-red-600">{erreur}</p>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Fil d'ariane + actions */}
      <div className="flex items-center justify-between">
        <Link to="/projets" className="text-sm text-[#00B2A0] hover:underline">
          ← Retour aux projets
        </Link>
        <button
          onClick={supprimerProjet}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Supprimer le projet
        </button>
      </div>

      {/* En-tête projet */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{projet.nom}</h1>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
              couleurStatut[projet.statut_sante] || "bg-slate-100 text-slate-700"
            }`}
          >
            {projet.statut_sante}
          </span>
        </div>
        {projet.description && (
          <p className="mb-4 text-sm text-slate-600">{projet.description}</p>
        )}
        <div className="mb-1 h-2 w-full overflow-hidden rounded bg-slate-100">
          <div
            className="h-full bg-[#00B2A0]"
            style={{ width: `${projet.avancement_pct || 0}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>{projet.avancement_pct || 0}% terminé</span>
          {projet.date_debut && <span>Début : {projet.date_debut}</span>}
          {projet.date_fin_prevue && <span>Échéance : {projet.date_fin_prevue}</span>}
        </div>
        <div className="mt-4">
          <Link
            to="/taches"
            className="text-sm font-medium text-[#00B2A0] hover:underline"
          >
            Voir les tâches (Kanban) →
          </Link>
        </div>
      </div>

      {/* Membres de l'équipe */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Équipe du projet ({membres.length})
        </h2>

        {membres.length === 0 && (
          <p className="mb-4 text-sm text-slate-500">Aucun membre pour l'instant.</p>
        )}

        <ul className="mb-6 divide-y">
          {membres.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-slate-800">
                  {m.prenom} {m.nom}
                  {m.est_responsable && (
                    <span className="ml-2 rounded bg-[#00B2A0]/10 px-2 py-0.5 text-xs font-medium text-[#00B2A0]">
                      Responsable
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {m.email}
                  {" · "}
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      couleurRoleGlobal[m.role_global] || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {m.role_global}
                  </span>
                  {m.role_dans_projet && ` · ${m.role_dans_projet}`}
                </p>
              </div>
              {!m.est_responsable && (
                <button
                  onClick={() => retirerMembre(m)}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600"
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Ajouter un membre */}
        <form
          onSubmit={ajouterMembre}
          className="flex flex-col gap-3 rounded-md bg-slate-50 p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Ajouter un membre
            </label>
            <select
              value={nouvelUtilisateurId}
              onChange={(e) => setNouvelUtilisateurId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
            >
              <option value="">— Choisir un utilisateur —</option>
              {disponibles.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.prenom} {u.nom} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Rôle dans le projet
            </label>
            <input
              type="text"
              value={roleDansProjet}
              onChange={(e) => setRoleDansProjet(e.target.value)}
              placeholder="développeur, graphiste…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
            />
          </div>
          <button
            type="submit"
            disabled={ajoutEnCours || disponibles.length === 0}
            className="rounded-md bg-[#00B2A0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56] disabled:opacity-50"
          >
            {ajoutEnCours ? "Ajout…" : "Ajouter"}
          </button>
        </form>
        {ajoutErreur && <p className="mt-2 text-sm text-red-600">{ajoutErreur}</p>}
        {disponibles.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Tous les utilisateurs sont déjà membres de ce projet.
          </p>
        )}
      </div>
    </div>
  );
}
