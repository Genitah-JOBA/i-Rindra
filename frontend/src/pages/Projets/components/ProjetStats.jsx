// src/pages/Projets/components/ProjetStats.jsx
export default function ProjetStats({ stats }) {
  const items = [
    { label: "Total", value: stats.total, color: "text-slate-900" },
    { label: "En cours", value: stats.enCours, color: "text-blue-600" },
    { label: "Terminés", value: stats.termines, color: "text-green-600" },
    { label: "En retard", value: stats.enRetard, color: "text-red-600" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mb-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="bg-white rounded-lg border border-slate-200 p-3 md:p-4 shadow-sm"
        >
          <p className="text-xs text-slate-500 uppercase tracking-wider">{item.label}</p>
          <p className={`text-xl md:text-2xl font-bold ${item.color}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}