// src/pages/ProjetDetail/index.jsx — fiche d'un projet : infos + gestion des membres (RF-06, RF-13) + fichiers (RF-08).
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { projetsService } from "../../api/projets";
import { fichiersService } from "../../api/fichiers";
import { useAuth } from "../../auth/AuthContext";

const couleurStatut = {
  vert: "bg-green-100 text-green-800",
  orange: "bg-orange-100 text-orange-800",
  rouge: "bg-red-100 text-red-800",
};

const couleurRoleGlobal = {
  direction: "bg-purple-100 text-purple-700",
  drh: "bg-rose-100 text-rose-700",
  chef_de_projet: "bg-indigo-100 text-indigo-700",
  equipe: "bg-blue-100 text-blue-700",
  client: "bg-amber-100 text-amber-700",
};

// Petit badge d'aperçu selon le type MIME
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

export default function ProjetDetail() {
  const { user } = useAuth();
  const { id } = useParams();
  const estGestion = ["direction", "drh", "chef_de_projet"].includes(user?.role);

  const [projet, setProjet] = useState(null);
  const [membres, setMembres] = useState([]);
  const [disponibles, setDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");

  // Formulaire d'ajout de membre (on n'a plus besoin d'un rôle : le métier du membre suffit)
  const [nouvelUtilisateurId, setNouvelUtilisateurId] = useState("");
  const [ajoutErreur, setAjoutErreur] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  // Fichiers du projet (RF-08)
  const [fichiers, setFichiers] = useState([]);
  const [fichierSelectionne, setFichierSelectionne] = useState(null);
  const [uploadEnCours, setUploadEnCours] = useState(false);
  const [fichiersErreur, setFichiersErreur] = useState("");
  const fichierInputRef = useRef(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur("");
    try {
      const [p, m, dispo, f] = await Promise.all([
        projetsService.get(id),
        projetsService.getMembres(id).catch(() => []),
        projetsService.getMembresDisponibles(id).catch(() => []),
        fichiersService.listByProjet(id).catch(() => []),
      ]);
      setProjet(p);
      setMembres(m || []);
      setDisponibles(dispo || []);
      setFichiers(f || []);
    } catch (err) {
      setErreur(err.response?.data?.detail || "Projet introuvable.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const declencherUpload = async (e) => {
    e.preventDefault();
    if (!fichierSelectionne) return;
    setUploadEnCours(true);
    setFichiersErreur("");
    try {
      await fichiersService.upload(id, fichierSelectionne);
      setFichierSelectionne(null);
      if (fichierInputRef.current) fichierInputRef.current.value = "";
      await charger();
    } catch (err) {
      setFichiersErreur(err.response?.data?.detail || "Échec de l'upload.");
    } finally {
      setUploadEnCours(false);
    }
  };

  const telecharger = async (f) => {
    try {
      await fichiersService.telecharger(id, f.id, f.nom);
    } catch (err) {
      alert(
        err.response?.data?.detail || "Impossible de télécharger ce fichier.",
      );
    }
  };

  const renommerFichier = async (f) => {
    const nouveauNom = window.prompt("Nouveau nom du fichier :", f.nom);
    if (
      nouveauNom == null ||
      nouveauNom.trim() === "" ||
      nouveauNom.trim() === f.nom
    )
      return;
    try {
      await fichiersService.renommer(id, f.id, nouveauNom.trim());
      await charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Impossible de renommer ce fichier.");
    }
  };

  const supprimerFichier = async (f) => {
    if (!window.confirm(`Supprimer définitivement le fichier « ${f.nom} » ?`))
      return;
    try {
      await fichiersService.remove(id, f.id);
      await charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Impossible de supprimer ce fichier.");
    }
  };

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
      });
      setNouvelUtilisateurId("");
      await charger(); // recharge membres + disponibles
    } catch (err) {
      setAjoutErreur(err.response?.data?.detail || "Erreur lors de l'ajout.");
    } finally {
      setAjoutEnCours(false);
    }
  };

  const retirerMembre = async (membre) => {
    if (!window.confirm(`Retirer ${membre.prenom} ${membre.nom} du projet ?`))
      return;
    try {
      await projetsService.removeMembre(id, membre.utilisateur_id);
      await charger();
    } catch (err) {
      alert(err.response?.data?.detail || "Impossible de retirer ce membre.");
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/projets" className="text-sm text-[#00B2A0] hover:underline">
          ← Retour aux projets
        </Link>
      </div>

      {/* Bandeau archivé */}
      {projet.archive && (
        <div className="flex items-center gap-2 border bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
          📦 Ce projet est archivé. Il est masqué de la liste des projets actifs.
        </div>
      )}

      {/* En-tête projet */}
      <div className="border bg-white p-6 shadow-sm">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{projet.nom}</h1>
            {projet.archive && (
              <span className="bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                Archivé
              </span>
            )}
          </div>
          <span
            className={`shrink-0 px-2 py-0.5 text-xs font-medium ${
              couleurStatut[projet.statut_sante] ||
              "bg-slate-100 text-slate-700"
            }`}
          >
            {projet.statut_sante}
          </span>
        </div>
        {projet.description && (
          <p className="mb-4 text-sm text-slate-600">{projet.description}</p>
        )}
        <div className="mb-1 h-2 w-full overflow-hidden bg-slate-100">
          <div
            className="h-full bg-[#00B2A0]"
            style={{ width: `${projet.avancement_pct || 0}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>{projet.avancement_pct || 0}% terminé</span>
          {projet.date_debut && <span>Début : {projet.date_debut}</span>}
          {projet.date_fin_prevue && (
            <span>Échéance : {projet.date_fin_prevue}</span>
          )}
        </div>
        <div className="mt-4">
          <Link
            to={`/taches?projet=${id}`}
            className="text-sm font-medium text-[#00B2A0] hover:underline"
          >
            Voir les tâches (Kanban) →
          </Link>
        </div>
      </div>

      {/* Membres de l'équipe */}
      <div className="border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Équipe du projet ({membres.length})
        </h2>

        {membres.length === 0 && (
          <p className="mb-4 text-sm text-slate-500">
            Aucun membre pour l'instant.
          </p>
        )}

        <ul className="mb-6 divide-y">
          {membres.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-slate-800 py-1">
                  {m.prenom} {m.nom}
                  {m.est_responsable && (
                    <span className="ml-2 bg-[#00B2A0]/10 px-2 py-0.5 text-xs font-medium text-[#00B2A0]">
                      Responsable
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {m.email}
                  {" · "}
                  <span
                    className={`px-1.5 py-0.5 ${
                      couleurRoleGlobal[m.role_global] ||
                      "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {m.role_global}
                  </span>
                  {m.metier && ` · ${m.metier}`}
                </p>
              </div>
              {estGestion && !m.est_responsable && (
                <button
                  onClick={() => retirerMembre(m)}
                  className="border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600"
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Ajouter un membre — réservé à la gestion */}
        {estGestion && (
          <form
            onSubmit={ajouterMembre}
            className="flex flex-col gap-3 bg-slate-50 p-4 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Ajouter un membre
              </label>
              <select
                value={nouvelUtilisateurId}
                onChange={(e) => setNouvelUtilisateurId(e.target.value)}
                className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#00B2A0]"
              >
                <option value="">— Choisir un utilisateur —</option>
                {disponibles.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.prenom} {u.nom}
                    {u.metier ? ` — ${u.metier}` : ` (${u.role})`}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={ajoutEnCours || disponibles.length === 0}
              className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56] disabled:opacity-50"
            >
              {ajoutEnCours ? "Ajout…" : " + Ajouter"}
            </button>
          </form>
        )}
        {ajoutErreur && (
          <p className="mt-2 text-sm text-red-600">{ajoutErreur}</p>
        )}
        {disponibles.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Tous les utilisateurs sont déjà membres de ce projet.
          </p>
        )}
      </div>

      {/* Fichiers du projet */}
      <div className="border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Fichiers du projet ({fichiers.length})
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Documents joints au projet, dont le cahier des charges. Formats
          acceptés : images, PDF, Word, Excel. Taille max : 50 Mo.
        </p>

        {projet.archive && (
          <p className="mb-4 bg-slate-50 px-4 py-2 text-sm text-slate-500">
            Ce projet est archivé : l'ajout et la modification de fichiers sont
            désactivés.
          </p>
        )}

        {/* Upload — réservé à la gestion */}
        {!projet.archive && estGestion && (
          <form
            onSubmit={declencherUpload}
            className="mb-6 flex flex-col gap-3 bg-slate-50 p-4 sm:flex-row sm:items-center"
          >
<input
            ref={fichierInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={(e) =>
              setFichierSelectionne(e.target.files[0] || null)
            }
              className="flex-1 text-sm text-slate-600 file:mr-3 file:border-0 file:bg-[#074E56] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#00B2A0]"
            />
            <button
              type="submit"
              disabled={!fichierSelectionne || uploadEnCours}
              className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#074E56] disabled:opacity-50"
            >
              {uploadEnCours ? "Envoi…" : "Envoyer le fichier"}
            </button>
          </form>
        )}
        {fichiersErreur && (
          <p className="mb-3 text-sm text-red-600">{fichiersErreur}</p>
        )}

        {/* Liste */}
        {fichiers.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun fichier joint pour l'instant.
          </p>
        ) : (
          <ul className="divide-y">
            {fichiers.map((f) => {
              const info = infoType(f.type_mime);
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`shrink-0 px-2 py-1 text-[10px] font-bold ${info.classe}`}
                    >
                      {info.label}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">
                        {f.nom}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatTaille(f.taille_octets)}
                        {f.cree_le &&
                          ` · ${new Date(f.cree_le).toLocaleDateString("fr-FR")}`}
                        {f.televerse_par_nom && ` · par ${f.televerse_par_nom}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => telecharger(f)}
                      className="border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-[#00B2A0]/10 hover:text-[#00B2A0]"
                    >
                      Télécharger
                    </button>
                    {estGestion && !projet.archive && (
                      <>
                        <button
                          onClick={() => renommerFichier(f)}
                          className="border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Renommer
                        </button>
                        <button
                          onClick={() => supprimerFichier(f)}
                          className="border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600"
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
