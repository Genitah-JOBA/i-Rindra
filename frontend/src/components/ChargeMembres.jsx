// src/components/ChargeMembres.jsx — bloc « Charge par membre » (RF-17) du tableau de bord.
// Les alertes de surcharge (RF-18) sont envoyées en notifications (cloche).

function dateFr(iso) {
  if (!iso) return null;
  const [a, m, j] = String(iso).slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

const IconeEquipe = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
);

function BlocCharge({ charge }) {
  return (
    <div className="bg-white border border-slate-200 p-3 sm:p-4 shadow-sm animate__animated animate__fadeInUp">
      <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <IconeEquipe className="w-4 h-4 text-i-blue" />
        Charge par membre
      </h3>
      {charge.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Aucune tâche ouverte assignée.</p>
      ) : (
        <ul className="space-y-3">
          {charge.map((m) => (
            <li key={m.utilisateur_id}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium text-i-primary">
                  {m.nom}
                  {m.metier && <span className="ml-1.5 text-xs font-normal text-slate-400">{m.metier}</span>}
                </p>
                {m.surcharge && (
                  <span className="shrink-0 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Surcharge</span>
                )}
              </div>
              <div className="h-2 bg-slate-100" title={`${m.charge_pct} % du seuil de surcharge`}>
                <div
                  className={`h-full transition-all ${
                    m.surcharge ? "bg-red-500" : m.charge_pct >= 60 ? "bg-orange-400" : "bg-gradient-to-r from-i-blue to-i-green"
                  }`}
                  style={{ width: `${Math.max(m.charge_pct, 4)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {m.taches_ouvertes} tâche{m.taches_ouvertes > 1 ? "s" : ""} ouverte{m.taches_ouvertes > 1 ? "s" : ""}
                {m.taches_en_retard > 0 && <span className="text-red-600"> · {m.taches_en_retard} en retard</span>}
                {m.taches_haute_priorite > 0 && <> · {m.taches_haute_priorite} priorité haute</>}
                {m.prochaine_echeance && <> · prochaine échéance {dateFr(m.prochaine_echeance)}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ChargeMembres({ charge }) {
  if (!charge) return null;
  return (
    <div className="mb-4 sm:mb-6">
      <BlocCharge charge={charge} />
    </div>
  );
}
