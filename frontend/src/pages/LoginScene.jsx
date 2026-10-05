// LoginScene.jsx — petite scène animée qui raconte i-Rindra sur la page de connexion :
//   1. l'IA analyse le cahier des charges,
//   2. elle propose des tâches (« l'IA propose, l'humain valide »),
//   3. les tâches avancent sur le Kanban et l'avancement du projet monte,
//   4. le jalon est atteint : le projet passe au vert. Puis on recommence.
// Discret : petite taille, transitions lentes, faible contraste.
import { useEffect, useState } from "react";

const ETAPES = [
  { texte: "Analyse du cahier des charges…", avancement: 0, sante: "orange", duree: 2200 },
  { texte: "3 tâches proposées par l'IA", avancement: 10, sante: "orange", duree: 2600 },
  { texte: "Tâche « Maquettes » en cours", avancement: 40, sante: "orange", duree: 2600 },
  { texte: "Jalon atteint · projet au vert", avancement: 75, sante: "vert", duree: 3400 },
];

const COLONNES = ["À faire", "En cours", "Terminé"];
const LARGEUR_COLONNE = 84; // px
const PAS_COLONNE = 92;     // largeur + espacement
const HAUTEUR_LIGNE = 16;   // px

// Position [colonne, ligne] de chaque tâche à chaque étape (null = pas encore créée)
const TACHES = [
  { id: "a", positions: [null, [0, 0], [1, 0], [2, 0]] },
  { id: "b", positions: [null, [0, 1], [0, 0], [1, 0]] },
  { id: "c", positions: [null, [0, 2], [0, 1], [0, 0]] },
];

const COULEUR_COLONNE = [
  "bg-white/25",
  "bg-gradient-to-r from-i-blue to-i-turquoise",
  "bg-gradient-to-r from-i-green to-i-turquoise shadow-[0_0_10px_rgba(125,249,121,0.5)]",
];

function mouvementReduit() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function LoginScene() {
  // Animations réduites demandées : on montre directement l'état final.
  const [etape, setEtape] = useState(() => (mouvementReduit() ? 3 : 0));

  useEffect(() => {
    if (mouvementReduit()) return undefined;
    const minuterie = setTimeout(
      () => setEtape((e) => (e + 1) % ETAPES.length),
      ETAPES[etape].duree,
    );
    return () => clearTimeout(minuterie);
  }, [etape]);

  const courante = ETAPES[etape];

  return (
    <div
      className="w-full max-w-[300px] border border-white/10 bg-white/[0.04] p-4 text-left backdrop-blur-sm"
      aria-hidden="true"
    >
      {/* En-tête du projet : nom + santé */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-white/90">Projet · Site vitrine</span>
        <span className="flex items-center gap-1.5 text-[10px] text-white/60">
          <span
            className={`h-2 w-2 rounded-full transition-colors duration-700 ${
              courante.sante === "vert" ? "bg-i-green shadow-[0_0_8px_#7DF979]" : "bg-amber-400"
            }`}
          />
          {courante.sante === "vert" ? "Bon" : "Attention"}
        </span>
      </div>

      {/* Assistant IA : message de l'étape */}
      <div className="mb-3 flex items-center gap-2 border border-i-blue/20 bg-i-blue/10 px-2 py-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-gradient-to-br from-i-blue to-i-green text-[9px] font-bold text-i-primary">
          IA
        </span>
        <span key={etape} className="login-scene-texte truncate text-[11px] text-i-turquoise">
          {courante.texte}
        </span>
        {etape === 0 && (
          <span className="ml-auto flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="login-scene-point h-1 w-1 rounded-full bg-i-turquoise"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}
      </div>

      {/* Mini-Kanban */}
      <div className="relative h-[66px]">
        <div className="grid grid-cols-3 gap-2">
          {COLONNES.map((titre) => (
            <span key={titre} className="text-[9px] uppercase tracking-wider text-white/40">
              {titre}
            </span>
          ))}
        </div>
        {TACHES.map((t, i) => {
          const pos = t.positions[etape];
          const [col, ligne] = pos || [0, 0];
          return (
            <span
              key={t.id}
              className={`absolute left-0 top-[16px] h-[11px] transition-all duration-700 ease-in-out ${COULEUR_COLONNE[col]}`}
              style={{
                width: LARGEUR_COLONNE,
                transform: `translate(${col * PAS_COLONNE}px, ${ligne * HAUTEUR_LIGNE}px)`,
                opacity: pos ? 1 : 0,
                // Les propositions de l'IA apparaissent l'une après l'autre
                transitionDelay: etape === 1 ? `${i * 180}ms` : "0ms",
              }}
            />
          );
        })}
      </div>

      {/* Avancement du projet */}
      <div className="mt-1">
        <div className="mb-1 flex justify-between text-[10px] text-white/50">
          <span>Avancement</span>
          <span className="tabular-nums">{courante.avancement} %</span>
        </div>
        <div className="h-1.5 bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-i-blue to-i-green transition-[width] duration-1000 ease-out"
            style={{ width: `${courante.avancement}%` }}
          />
        </div>
      </div>
    </div>
  );
}
