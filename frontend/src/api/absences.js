// src/api/absences.js
import api from "./client";

export const absencesService = {
  list: async () => {
    const response = await api.get("/absences");
    return response.data;
  },

  stats: async () => {
    const response = await api.get("/absences/statistiques");
    return response.data;
  },

  create: async (data) => {
    const response = await api.post("/absences", data);
    return response.data;
  },

  decide: async (id, data) => {
    const response = await api.patch(`/absences/${id}/decision`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/absences/${id}`);
    return response.data;
  },
};