// ProjetsBesti.jsx — projets créés par le client dans Besti, en CONSULTATION SEULE.
// Tout se modifie dans Besti : aucune action d'écriture ici.
import { useEffect, useState } from "react";
import { bestiService } from "../api/besti";
import Spin from "../components/Spin";

const URL_BESTI = "https://besti.bef4prod.com";

// Codes connus aujourd'hui, pour la couleur seulement : le libellé vient de
// Besti, et un code inconnu s'affiche normalement en couleur neutre.
const COULEUR_STATUT_BESTI = {
  soumis: "bg-slate-100 text-slate-700",
  en_etude: "bg-blue-100 text-blue-700",
  estimation_disponible: "bg-amber-100 text-amber-800",
  negociation: "bg-purple-100 text-purple-700",
  accepte: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-700",
};
const COULEUR_NEUTRE = "bg-slate-100 text-slate-700";

const MOTIF_ARCHIVAGE = {
  supprime_besti: "Supprimé dans Besti le",
  compte_desactive: "Archivé (compte désactivé) le",
};

const fmtDate = (valeur) =>
  valeur
    ? new Date(valeur).toLocaleDateString(
        navigator.language?.startsWith("en") ? "en-GB" : "fr-FR",
      )
    : "—";

const fmtTaille = (octets) => {
  if (!octets && octets !== 0) return "";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
};

// Le détail d'erreur d'une réponse `blob` est lui-même un blob JSON.
const messageErreur = async (err, defaut) => {
  const data = err.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).detail || defaut;
    } catch {
      return defaut;
    }
  }
  return data?.detail || defaut;
};

function PastilleStatut({ statut }) {
  if (!statut) return null;
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        COULEUR_STATUT_BESTI[statut.code] || COULEUR_NEUTRE
      }`}
    >
      {statut.libelle}
    </span>
  );
}

function DetailProjet({ projetId }) {
  const [projet, setProjet] = useState(null);
  const [erreur, setErreur] = useState("");
  const [erreurFichier, setErreurFichier] = useState("");

  useEffect(() => {
    let annule = false;
    bestiService
      .getProjet(projetId)
      .then((data) => !annule && setProjet(data))
      .catch((err) => !annule && setErreur(err.response?.data?.detail || "Projet introuvable."));
    return () => {
      annule = true;
    };
  }, [projetId]);

  const telecharger = async (fichier) => {
    setErreurFichier("");
    try {
      await bestiService.telechargerFichier(fichier.id, fichier.nom);
    } catch (err) {
      setErreurFichier(await messageErreur(err, "Téléchargement impossible."));
    }
  };

  if (erreur)
    return <p className="text-sm text-red-700">{erreur}</p>;
  if (!projet) return <Spin className="py-8" />;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">{projet.nom}</h2>
          <PastilleStatut statut={projet.statut} />
        </div>
        {projet.archive_le && (
          <p className="mt-1 text-sm text-orange-700">
            {MOTIF_ARCHIVAGE[projet.motif_archivage] || "Archivé le"} {fmtDate(projet.archive_le)}
          </p>
        )}
        {projet.description && (
          <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{projet.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          <span>{"Créé le"} {fmtDate(projet.cree_le)}</span>
          <span>{"Échéance souhaitée"} : {fmtDate(projet.echeance_souhaitee)}</span>
        </div>
      </div>

      {/* Historique complet des statuts */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {"Historique des statuts"}
        </h3>
        <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
          {[...projet.historique].reverse().map((h, i) => (
            <li key={`${h.code}-${i}`} className="flex flex-wrap items-center gap-3 text-sm">
              <PastilleStatut statut={h} />
              <span className="text-slate-500">{fmtDate(h.depuis)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Cahiers des charges */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {"Cahiers des charges et demandes"}
        </h3>
        {erreurFichier && (
          <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erreurFichier}
          </p>
        )}
        {projet.cahiers.length === 0 ? (
          <p className="text-sm text-slate-500">{"Aucun cahier des charges."}</p>
        ) : (
          <div className="space-y-3">
            {projet.cahiers.map((c) => (
              <div key={c.id} className="border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{c.titre}</p>
                  <PastilleStatut statut={c.statut} />
                </div>
                <p className="text-xs text-slate-500">{"Soumis le"} {fmtDate(c.soumis_le)}</p>
                {c.description && (
                  <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{c.description}</p>
                )}
                {c.fichiers.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {c.fichiers.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => telecharger(f)}
                          className="text-sm text-i-blue hover:underline"
                        >
                          📄 {f.nom}
                        </button>
                        <span className="ml-2 text-xs text-slate-400">{fmtTaille(f.taille_octets)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {c.liens.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.liens.map((l) => (
                      <li key={l.id}>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-i-blue hover:underline"
                        >
                          🔗 {l.libelle || l.url}
                        </a>
                        {l.fournisseur && (
                          <span className="ml-2 text-xs text-slate-400">{l.fournisseur}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjetsBesti() {
  const [archives, setArchives] = useState(false);
  const [projets, setProjets] = useState(null);
  const [projetId, setProjetId] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let annule = false;
    bestiService
      .listProjets(archives)
      .then((data) => {
        if (annule) return;
        setProjets(data);
        setProjetId(data[0]?.id || null);
      })
      .catch((err) => {
        if (!annule) setErreur(err.response?.data?.detail || "Impossible de charger vos projets Besti.");
      });
    return () => {
      annule = true;
    };
  }, [archives]);

  const changerListe = (valeur) => {
    if (valeur === archives) return;
    setProjets(null);
    setErreur("");
    setArchives(valeur);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>{"Pour modifier ce projet, rendez-vous sur Besti."}</span>
        <a
          href={URL_BESTI}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-i-blue hover:underline"
        >
          {"Ouvrir Besti ↗"}
        </a>
      </div>

      <div className="flex gap-2">
        {[
          [false, "Projets en cours"],
          [true, "Archivés"],
        ].map(([valeur, libelle]) => (
          <button
            key={libelle}
            type="button"
            onClick={() => changerListe(valeur)}
            className={`px-4 py-2 text-sm font-medium border transition-colors ${
              archives === valeur
                ? "bg-brand-gradient border-i-blue text-i-primary"
                : "bg-white border-slate-200 text-slate-700 hover:border-i-blue"
            }`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {erreur ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erreur}</p>
      ) : projets === null ? (
        <Spin className="py-8" />
      ) : projets.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {archives ? "Aucun projet archivé." : "Aucun projet Besti pour le moment."}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <ul className="space-y-2">
            {projets.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setProjetId(p.id)}
                  className={`w-full border px-3 py-2 text-left transition-colors ${
                    p.id === projetId
                      ? "border-i-blue bg-white shadow-sm"
                      : "border-slate-200 bg-white hover:border-i-blue"
                  }`}
                >
                  <p className="truncate text-sm font-medium text-slate-900">{p.nom}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <PastilleStatut statut={p.statut} />
                    <span className="text-xs text-slate-400">
                      {p.archive_le ? fmtDate(p.archive_le) : fmtDate(p.maj_le)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="border border-slate-200 bg-white p-4 sm:p-6">
            {projetId && <DetailProjet key={projetId} projetId={projetId} />}
          </div>
        </div>
      )}
    </div>
  );
}
