// src/api/suggestionDevis.js — devis suggérés par l'IA (direction / DRH uniquement).
import api from "./client";

export const suggestionDevisService = {
  list: async () => {
    const { data } = await api.get("/suggestion-devis/");
    return data;
  },
  genererIA: async (payload) => {
    const { data } = await api.post("/suggestion-devis/ia", payload);
    return data;
  },
  remove: async (id) => {
    await api.delete(`/suggestion-devis/${id}`);
  },
};