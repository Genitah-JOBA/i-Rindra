// src/components/DevisContenu.jsx — rendu structuré d'un devis généré par l'IA.
// Segmentation du texte libre en sections, tableau de prestations et totaux.

const MOTS_TOTAUX = [
  "total",
  "tva",
  "ttc",
  "acompte",
  "solde",
  "net à payer",
  "reste à payer",
];

function estLigneTotal(ligne) {
  const l = ligne.toLowerCase();
  return /[0-9]/.test(ligne) && MOTS_TOTAUX.some((m) => l.includes(m));
}

function estLigneColonnes(ligne) {
  return ligne.includes("|") && ligne.split("|").length >= 3;
}

function estTitreSection(ligne) {
  const l = ligne.trim();
  const lc = l.toLowerCase();
  if (l.endsWith(":") && l.length <= 45) return true;
  return /^(en-t[eêÈ]te|pr[ée]stations|d[éeÉ]signation|totaux|conditions|descriptif|r[éeÉ]capitulatif|validit[éeÉ]|r[éeÉ]f[éeÉ]rence)/i.test(
    lc
  );
}

function estTitreEnTete(ligne) {
  return /^(devis n[°o]|agence bienfe|bienfe)/i.test(ligne.trim());
}

function decouperLignes(contenu) {
  const blocs = [];
  let courant = null;

  (contenu || "").split(/\r?\n/).forEach((raw) => {
    const l = raw.trim();
    if (!l) {
      courant = null;
      return;
    }
    if (estLigneColonnes(l)) {
      const cols = l
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c !== "");
      if (!courant || courant.type !== "table") {
        courant = { type: "table", rows: [] };
        blocs.push(courant);
      }
      courant.rows.push(cols);
      return;
    }
    courant = null;
    if (estLigneTotal(l)) {
      blocs.push({ type: "total", texte: l });
    } else if (estTitreEnTete(l)) {
      blocs.push({ type: "en_tete", texte: l });
    } else if (estTitreSection(l)) {
      blocs.push({ type: "titre", texte: l });
    } else {
      blocs.push({ type: "texte", texte: l });
    }
  });

  return blocs;
}

function BlocTableau({ rows }) {
  const nbCols = Math.max(...rows.map((r) => r.length));
  const entete = rows[0].every((c) => !/[0-9]/.test(c));
  return (
    <div className="my-1 overflow-hidden border border-slate-200">
      {rows.map((row, idx) => {
        const estEntete = entete && idx === 0;
        return (
          <div
            key={idx}
            className={`border-b border-slate-100 last:border-b-0 ${
              estEntete ? "bg-slate-50" : ""
            }`}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${nbCols}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: nbCols }).map((_, c) => (
              <div
                key={c}
                className={`px-2 py-1 text-xs whitespace-nowrap ${
                  estEntete
                    ? "font-semibold text-slate-700"
                    : "text-slate-600"
                } ${c > 0 ? "text-right" : "text-left"} ${
                  c > 0 ? "border-l border-slate-100" : ""
                }`}
              >
                {row[c] || ""}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function DevisContenu({ contenu, className = "" }) {
  const blocs = decouperLignes(contenu);

  return (
    <div className={`${className}`}>
      {blocs.map((bloc, idx) => {
        switch (bloc.type) {
          case "en_tete":
            return (
              <p
                key={idx}
                className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide"
              >
                {bloc.texte}
              </p>
            );
          case "titre":
            return (
              <p
                key={idx}
                className="mt-2 mb-1 text-[11px] font-bold text-[#63B23E] uppercase tracking-wider border-l-2 border-[#63B23E] pl-2"
              >
                {bloc.texte.replace(/:$/, "")}
              </p>
            );
          case "total":
            return (
              <p
                key={idx}
                className="py-1 px-2 my-0.5 text-xs sm:text-sm font-bold text-green-800 bg-green-50 border border-green-200"
              >
                {bloc.texte}
              </p>
            );
          case "table":
            return <BlocTableau key={idx} rows={bloc.rows} />;
          default:
            return (
              <p
                key={idx}
                className="text-xs sm:text-sm text-slate-700 leading-relaxed"
              >
                {bloc.texte}
              </p>
            );
        }
      })}
    </div>
  );
}