// src/components/ReponseIA.jsx — affiche proprement une réponse de l'IA écrite en
// Markdown : titres, listes (puces / numérotées, imbriquées), gras, italique,
// code, tableaux, séparateurs. Sans dépendance et sans HTML injecté : tout est
// rendu en éléments React (aucun risque XSS).

// --- Mise en forme dans une ligne -------------------------------------------
const MOTIF_INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[\d+(?:,\s*\d+)*\])/g;

function Inline({ texte }) {
  const morceaux = texte.split(MOTIF_INLINE).filter((m) => m !== "");
  return morceaux.map((m, i) => {
    if ((m.startsWith("**") && m.endsWith("**")) || (m.startsWith("__") && m.endsWith("__"))) {
      return <strong key={i} className="font-semibold text-i-primary">{m.slice(2, -2)}</strong>;
    }
    if (m.startsWith("`") && m.endsWith("`")) {
      return <code key={i} className="bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-700">{m.slice(1, -1)}</code>;
    }
    if (/^\[\d+(?:,\s*\d+)*\]$/.test(m)) {
      // Référence à une source (ex. [15]) : discrète
      return <sup key={i} className="ml-0.5 text-[10px] font-medium text-i-blue">{m}</sup>;
    }
    if (m.length > 2 && ((m.startsWith("*") && m.endsWith("*")) || (m.startsWith("_") && m.endsWith("_")))) {
      return <em key={i}>{m.slice(1, -1)}</em>;
    }
    return <span key={i}>{m}</span>;
  });
}

// --- Découpage en blocs ------------------------------------------------------
const RE_PUCE = /^(\s*)[*\-•+]\s+(.*)$/;
const RE_NUM = /^(\s*)(\d+)[.)]\s+(.*)$/;
const RE_TITRE = /^(#{1,6})\s+(.*)$/;
const RE_SEP = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const RE_TABLE = /^\s*\|.*\|\s*$/;

function niveau(indent) {
  return Math.min(2, Math.floor(indent.replace(/\t/g, "  ").length / 2));
}

function analyser(texte) {
  const lignes = String(texte || "").replace(/\r\n/g, "\n").split("\n");
  const blocs = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (!l.trim()) { i++; continue; }

    if (l.trim().startsWith("```")) {
      const code = [];
      i++;
      while (i < lignes.length && !lignes[i].trim().startsWith("```")) code.push(lignes[i++]);
      i++;
      blocs.push({ type: "code", texte: code.join("\n") });
      continue;
    }
    if (RE_SEP.test(l)) { blocs.push({ type: "sep" }); i++; continue; }

    const t = l.match(RE_TITRE);
    if (t) { blocs.push({ type: "titre", niveau: t[1].length, texte: t[2].replace(/\s*#+\s*$/, "") }); i++; continue; }

    if (RE_TABLE.test(l)) {
      const rangees = [];
      while (i < lignes.length && RE_TABLE.test(lignes[i])) {
        const cellules = lignes[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cellules.every((c) => /^:?-{2,}:?$/.test(c))) rangees.push(cellules);
        i++;
      }
      blocs.push({ type: "table", rangees });
      continue;
    }

    if (RE_PUCE.test(l) || RE_NUM.test(l)) {
      const items = [];
      while (i < lignes.length && (RE_PUCE.test(lignes[i]) || RE_NUM.test(lignes[i]))) {
        const p = lignes[i].match(RE_PUCE);
        const n = lignes[i].match(RE_NUM);
        items.push(p
          ? { niveau: niveau(p[1]), num: null, texte: p[2] }
          : { niveau: niveau(n[1]), num: n[2], texte: n[3] });
        i++;
        // Ligne de continuation (indentée, sans puce) : rattachée à l'élément
        while (i < lignes.length && /^\s{2,}\S/.test(lignes[i]) && !RE_PUCE.test(lignes[i]) && !RE_NUM.test(lignes[i])) {
          items[items.length - 1].texte += " " + lignes[i].trim();
          i++;
        }
      }
      blocs.push({ type: "liste", items });
      continue;
    }

    const para = [l.trim()];
    i++;
    while (i < lignes.length && lignes[i].trim() && !RE_PUCE.test(lignes[i]) && !RE_NUM.test(lignes[i])
           && !RE_TITRE.test(lignes[i]) && !RE_TABLE.test(lignes[i]) && !RE_SEP.test(lignes[i])
           && !lignes[i].trim().startsWith("```")) {
      para.push(lignes[i].trim());
      i++;
    }
    blocs.push({ type: "para", lignes: para });
  }
  return blocs;
}

const RETRAIT = ["pl-0", "pl-5", "pl-10"];

export default function ReponseIA({ texte }) {
  const blocs = analyser(texte);
  return (
    <div className="space-y-2.5">
      {blocs.map((b, k) => {
        switch (b.type) {
          case "titre":
            return (
              <p key={k} className={`font-semibold text-i-primary ${b.niveau <= 2 ? "text-[15px] pt-1" : "text-sm"}`}>
                <Inline texte={b.texte} />
              </p>
            );
          case "sep":
            return <hr key={k} className="border-slate-200" />;
          case "code":
            return (
              <pre key={k} className="overflow-x-auto bg-slate-50 border border-slate-200 p-3 font-mono text-[12px] text-slate-700 whitespace-pre">
                {b.texte}
              </pre>
            );
          case "table":
            return (
              <div key={k} className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <tbody>
                    {b.rangees.map((r, ri) => (
                      <tr key={ri} className={ri === 0 ? "bg-i-primary text-white" : ri % 2 ? "bg-white" : "bg-slate-50"}>
                        {r.map((c, ci) => (
                          <td key={ci} className={`border border-slate-200 px-2.5 py-1.5 ${ri === 0 ? "font-semibold" : ""}`}>
                            <Inline texte={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "liste":
            return (
              <ul key={k} className="space-y-1">
                {b.items.map((it, ii) => (
                  <li key={ii} className={`flex gap-2 ${RETRAIT[it.niveau]}`}>
                    {it.num ? (
                      <span className="min-w-[1.25rem] shrink-0 font-semibold text-i-blue">{it.num}.</span>
                    ) : (
                      <span className={`mt-[0.55em] h-1.5 w-1.5 shrink-0 ${it.niveau ? "border border-i-blue" : "bg-i-blue"}`} />
                    )}
                    <span className="min-w-0"><Inline texte={it.texte} /></span>
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={k}>
                {b.lignes.map((l, li) => (
                  <span key={li}>
                    {li > 0 && <br />}
                    <Inline texte={l} />
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
