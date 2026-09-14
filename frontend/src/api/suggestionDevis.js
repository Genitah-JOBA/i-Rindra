// src/api/suggestionDevis.js — devis suggérés par l'IA (direction / DRH uniquement).
import api from "./client";

export const suggestionDevisService = {
  list: async (statut) => {
    const { data } = await api.get("/suggestion-devis/", {
      params: statut ? { statut } : {},
    });
    return data;
  },
  genererIA: async (payload) => {
    const { data } = await api.post("/suggestion-devis/ia", payload);
    return data;
  },
  setStatut: async (id, statut) => {
    const { data } = await api.patch(`/suggestion-devis/${id}/statut`, { statut });
    return data;
  },
  remove: async (id) => {
    await api.delete(`/suggestion-devis/${id}`);
  },
};