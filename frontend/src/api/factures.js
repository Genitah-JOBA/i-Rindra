// src/api/factures.js — appels REST du volet facturation (ADMIN uniquement).
import api from "./client";

export const facturesService = {
  list: async (params = {}) => {
    const { data } = await api.get("/factures/", { params });
    return data;
  },
  get: async (id) => {
    const { data } = await api.get(`/factures/${id}`);
    return data;
  },
  stats: async () => {
    const { data } = await api.get("/factures/statistiques");
    return data;
  },
  create: async (facture) => {
    const { data } = await api.post("/factures/", facture);
    return data;
  },
  update: async (id, facture) => {
    const { data } = await api.put(`/factures/${id}`, facture);
    return data;
  },
  setStatut: async (id, statut) => {
    const { data } = await api.patch(`/factures/${id}/statut`, { statut });
    return data;
  },
  telechargerPdf: async (id) => {
    return api.get(`/factures/${id}/pdf`, { responseType: "blob" });
  },
  remove: async (id) => {
    await api.delete(`/factures/${id}`);
  },
};
