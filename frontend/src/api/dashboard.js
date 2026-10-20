// src/api/dashboard.js — indicateurs du tableau de bord (RF-17)
import api from "./client";

export const dashboardService = {
  // Charge de travail par membre (tâches ouvertes, retards, surcharge)
  charge: async () => {
    const { data } = await api.get("/dashboard/charge");
    return data;
  },
  // Temps passé agrégé par projet et par membre (RF-24)
  temps: async () => {
    const { data } = await api.get("/dashboard/temps");
    return data;
  },
};
