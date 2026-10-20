// src/components/JalonsProjet.jsx — jalons d'un projet (RF-07).
//   - direction, DRH, chef de projet : créer, modifier, supprimer, réinitialiser ;
//   - équipe interne : marquer un jalon comme atteint ;
//   - client : consultation seule.
import { useCallback, useEffect, useState } from "react";
import { projetsService } from "../api/projets";
import { useMessage } from "../context/MessageContext";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

function dateFr(iso) {
  if (!iso) return "";
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

const VIDE = { titre: "", description: "", echeance: "" };

const CHAMP =
  "w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-i-blue focus:ring-2 focus:ring-i-blue/30";

function FormulaireJalon({ initial = VIDE, libelle, onValider, onAnnuler, enCours }) {
  const [valeurs, setValeurs] = useState({ ...VIDE, ...initial, description: initial.description || "" });
  const maj = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }));

  const soumettre = (e) => {
    e.preventDefault();
    onValider({
      titre: valeurs.titre.trim(),
      description: valeurs.description.trim() || null,
      echeance: valeurs.echeance,
    });
  };

  return (
    <form onSubmit={soumettre} className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-[1fr_11rem]">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Titre</label>
        <input required maxLength={200} value={valeurs.titre} onChange={maj("titre")} className={CHAMP}
               placeholder="Ex. Livraison de la maquette" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Échéance</label>
        <input required type="date" min={initial.echeance ? undefined : aujourdhui()} value={valeurs.echeance}
               onChange={maj("echeance")} className={CHAMP} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">Description (facultative)</label>
        <textarea rows={2} value={valeurs.description} onChange={maj("description")} className={CHAMP} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={enCours || !valeurs.titre.trim() || !valeurs.echeance}
                className="bg-i-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-i-blue disabled:opacity-50">
          {enCours ? "Enregistrement…" : libelle}
        </button>
        {onAnnuler && (
          <button type="button" onClick={onAnnuler}
                  className="border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-white">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

export default function JalonsProjet({ projetId, peutGerer = false, peutAtteindre = false, lectureSeule = false }) {
  const { showConfirm, showError, showSuccess } = useMessage();
  const [jalons, setJalons] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const gerer = peutGerer && !lectureSeule;
  const atteindre = (peutAtteindre || peutGerer) && !lectureSeule;

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setJalons(await projetsService.getJalons(projetId));
    } catch {
      setJalons([]);
    } finally {
      setChargement(false);
    }
  }, [projetId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
  }, [charger]);

  // Mise à jour locale d'un jalon, liste triée par échéance
  const remplacer = (j) =>
    setJalons((prev) =>
      [...prev.filter((x) => x.id !== j.id), j].sort((a, b) => String(a.echeance).localeCompare(String(b.echeance))),
    );

  const creer = async (valeurs) => {
    setEnCours(true);
    try {
      remplacer(await projetsService.createJalon(projetId, valeurs));
      setAjoutOuvert(false);
      showSuccess("Jalon ajouté.");
    } catch (err) {
      showError(err.response?.data?.detail || "Impossible d'ajouter le jalon.");
    } finally {
      setEnCours(false);
    }
  };

  const modifier = async (jalon, valeurs) => {
    setEnCours(true);
    try {
      remplacer(await projetsService.updateJalon(projetId, jalon.id, valeurs));
      setEnEdition(null);
      showSuccess("Jalon modifié.");
    } catch (err) {
      showError(err.response?.data?.detail || "Impossible de modifier le jalon.");
    } finally {
      setEnCours(false);
    }
  };

  const basculer = async (jalon) => {
    try {
      const maj = jalon.atteint
        ? await projetsService.reinitialiserJalon(projetId, jalon.id)
        : await projetsService.atteindreJalon(projetId, jalon.id);
      remplacer(maj);
    } catch (err) {
      showError(err.response?.data?.detail || "Action impossible sur ce jalon.");
    }
  };

  const supprimer = async (jalon) => {
    const ok = await showConfirm({
      type: "error",
      title: "Supprimer le jalon",
      message: `Supprimer le jalon « ${jalon.titre} » ?`,
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await projetsService.removeJalon(projetId, jalon.id);
      setJalons((prev) => prev.filter((x) => x.id !== jalon.id));
      showSuccess("Jalon supprimé.");
    } catch (err) {
      showError(err.response?.data?.detail || "Impossible de supprimer le jalon.");
    }
  };

  const atteints = jalons.filter((j) => j.atteint).length;
  const pct = jalons.length ? Math.round((atteints / jalons.length) * 100) : 0;
  const auj = aujourdhui();

  return (
    <div className="border bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-i-primary">
          Jalons du projet ({jalons.length})
        </h2>
        {gerer && !ajoutOuvert && (
          <button onClick={() => { setAjoutOuvert(true); setEnEdition(null); }}
                  className="bg-i-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-i-blue">
            + Ajouter un jalon
          </button>
        )}
      </div>

      {jalons.length > 0 && (
        <div className="mb-4">
          <div className="mb-1 h-2 w-full overflow-hidden bg-slate-100">
            <div className="h-full bg-gradient-to-r from-i-blue to-i-green" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-slate-500">{atteints} / {jalons.length} jalon{jalons.length > 1 ? "s" : ""} atteint{atteints > 1 ? "s" : ""} ({pct} %)</p>
        </div>
      )}

      {ajoutOuvert && (
        <div className="mb-4">
          <FormulaireJalon libelle="Ajouter" onValider={creer} onAnnuler={() => setAjoutOuvert(false)} enCours={enCours} />
        </div>
      )}

      {chargement ? (
        <p className="text-sm text-slate-400">Chargement des jalons…</p>
      ) : jalons.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun jalon défini pour l'instant.</p>
      ) : (
        <ol className="divide-y">
          {jalons.map((j) => {
            const enRetard = !j.atteint && String(j.echeance) < auj;
            if (enEdition === j.id) {
              return (
                <li key={j.id} className="py-3">
                  <FormulaireJalon initial={j} libelle="Enregistrer" onValider={(v) => modifier(j, v)}
                                   onAnnuler={() => setEnEdition(null)} enCours={enCours} />
                </li>
              );
            }
            return (
              <li key={j.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-1 h-3 w-3 shrink-0 border-2 ${
                      j.atteint ? "border-i-green bg-i-green" : enRetard ? "border-red-500" : "border-i-blue"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className={`font-medium ${j.atteint ? "text-slate-500 line-through" : "text-slate-800"}`}>{j.titre}</p>
                    {j.description && <p className="text-xs text-slate-500">{j.description}</p>}
                    <p className="mt-0.5 text-xs text-slate-500">
                      Échéance : {dateFr(j.echeance)}
                      {j.atteint && j.date_atteint && <> · atteint le {dateFr(j.date_atteint)}</>}
                      {enRetard && <span className="ml-1 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">En retard</span>}
                      {j.atteint && <span className="ml-1 bg-i-green/30 px-1.5 py-0.5 text-[10px] font-semibold text-i-primary">Atteint</span>}
                    </p>
                  </div>
                </div>
                {(atteindre || gerer) && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {(!j.atteint ? atteindre : gerer) && (
                      <button onClick={() => basculer(j)}
                              className="border border-i-blue/40 bg-i-blue/5 px-2.5 py-1 text-xs font-medium text-i-blue hover:bg-i-blue/10">
                        {j.atteint ? "Réinitialiser" : "Marquer atteint"}
                      </button>
                    )}
                    {gerer && (
                      <>
                        <button onClick={() => { setEnEdition(j.id); setAjoutOuvert(false); }}
                                className="border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          Modifier
                        </button>
                        <button onClick={() => supprimer(j)}
                                className="border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600">
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
