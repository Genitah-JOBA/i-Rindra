// src/api/dashboard.js — indicateurs du tableau de bord (RF-17)
import api from "./client";

export const dashboardService = {
  // Charge de travail par membre (tâches ouvertes, retards, surcharge)
  charge: async () => {
    const { data } = await api.get("/dashboard/charge");
    return data;
  },
};
