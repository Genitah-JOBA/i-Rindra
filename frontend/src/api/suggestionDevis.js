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
  // Données du devis telles qu'imprimées sur le PDF (affichage « Voir le détail »)
  apercu: async (id) => {
    const { data } = await api.get(`/suggestion-devis/${id}/apercu`);
    return data;
  },
  // PDF du devis (gabarit B-esti, charte i-Rindra)
  telechargerPdf: async (id) => {
    const reponse = await api.get(`/suggestion-devis/${id}/pdf`, { responseType: "blob" });
    const disposition = reponse.headers?.["content-disposition"] || "";
    const nom = /filename="?([^";]+)"?/.exec(disposition)?.[1] || `devis-${id}.pdf`;
    return { blob: reponse.data, nomFichier: nom };
  },
};