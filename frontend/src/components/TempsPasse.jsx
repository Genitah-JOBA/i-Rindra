// src/components/TempsPasse.jsx — temps passé agrégé (RF-24), alimenté par le
// chronomètre des tâches (RF-23). Deux usages :
//   - fiche projet : répartition par membre et par tâche ;
//   - tableau de bord : répartition par projet et par membre.

function formatDuree(minutes) {
  const m = Math.round(minutes || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

const IconeHorloge = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

function Repartition({ titre, lignes, total, max = 8 }) {
  const visibles = lignes.slice(0, max);
  const reste = lignes.length - visibles.length;
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titre}</h4>
      {lignes.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((l, i) => {
            const pct = total ? Math.round((l.duree_min / total) * 100) : 0;
            return (
              <li key={i}>
                <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-i-primary">{l.nom}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDuree(l.duree_min)} · {pct} %
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100">
                  <div className="h-full bg-gradient-to-r from-i-blue to-i-green" style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
              </li>
            );
          })}
          {reste > 0 && <li className="text-xs text-slate-400">+ {reste} autre{reste > 1 ? "s" : ""}</li>}
        </ul>
      )}
    </div>
  );
}

export default function TempsPasse({ donnees, mode = "projet", className = "" }) {
  if (!donnees) return null;
  const total = donnees.total_min || 0;
  const [gauche, droite] =
    mode === "projet"
      ? [["Par membre", donnees.par_membre], ["Par tâche", donnees.par_tache]]
      : [["Par projet", donnees.par_projet], ["Par membre", donnees.par_membre]];

  return (
    <div className={`border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:text-base">
          <IconeHorloge className="h-4 w-4 text-i-blue" />
          Temps passé
        </h3>
        <p className="text-sm text-slate-500">
          Total : <span className="text-lg font-bold text-i-primary">{formatDuree(total)}</span>
        </p>
      </div>
      {total === 0 ? (
        <p className="text-sm text-slate-400">
          Aucun temps enregistré pour l'instant (chronomètre des tâches).
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Repartition titre={gauche[0]} lignes={gauche[1] || []} total={total} />
          <Repartition titre={droite[0]} lignes={droite[1] || []} total={total} />
        </div>
      )}
    </div>
  );
}
