// src/context/ChronoContext.jsx — Chronomètre partagé.
// L'état vit ici (au niveau racine) pour survivre à la fermeture
// de la modale de détail de tâche : le temps continue de s'écouler
// même si la fenêtre est fermée puis rouverte.
import { createContext, useContext, useEffect, useState } from "react";

const ChronoContext = createContext(null);

export function ChronoProvider({ children }) {
  // chronos[tacheId] = { acc: nombre de secondes déjà comptées, startedAt: timestamp de démarrage | null }
  const [chronos, setChronos] = useState({});
  const [, setTick] = useState(0);

  // Tic-tac global : actif uniquement lorsqu'au moins un chrono tourne
  useEffect(() => {
    const enCourse = Object.values(chronos).some((c) => c.startedAt);
    if (!enCourse) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [chronos]);

  const getSecondes = (tacheId) => {
    const c = tacheId != null ? chronos[tacheId] : null;
    if (!c) return 0;
    if (c.startedAt) {
      return c.acc + Math.floor((Date.now() - c.startedAt) / 1000);
    }
    return c.acc;
  };

  const enCours = (tacheId) =>
    tacheId != null && !!chronos[tacheId]?.startedAt;

  const enPause = (tacheId) =>
    tacheId != null && chronos[tacheId] != null && chronos[tacheId].startedAt == null;

  const demarrer = (tacheId) => {
    setChronos((prev) => ({
      ...prev,
      [tacheId]: { acc: prev[tacheId]?.acc || 0, startedAt: Date.now() },
    }));
  };

  const mettreEnPause = (tacheId) => {
    setChronos((prev) => {
      const c = prev[tacheId];
      if (!c || !c.startedAt) return prev;
      return {
        ...prev,
        [tacheId]: {
          ...c,
          acc: c.acc + Math.floor((Date.now() - c.startedAt) / 1000),
          startedAt: null,
        },
      };
    });
  };

  const reinitialiser = (tacheId) => {
    setChronos((prev) => {
      if (!(tacheId in prev)) return prev;
      const next = { ...prev };
      delete next[tacheId];
      return next;
    });
  };

  const value = {
    getSecondes,
    enCours,
    enPause,
    demarrer,
    mettreEnPause,
    reinitialiser,
  };

  return (
    <ChronoContext.Provider value={value}>{children}</ChronoContext.Provider>
  );
}

export function useChrono() {
  const ctx = useContext(ChronoContext);
  if (!ctx) {
    throw new Error("useChrono doit être utilisé dans <ChronoProvider>");
  }
  return ctx;
}