// src/api/ia.js — appels REST liés à l'assistant IA (chat + pilotage RF-25 → RF-31).
import api from "./client";

export const iaService = {
  // --- Chat / vérification ---

  // État de la configuration IA
  status: async () => {
    const { data } = await api.get("/ia/status");
    return data;
  },

  // Test de connexion bout en bout
  ping: async () => {
    const { data } = await api.post("/ia/ping");
    return data;
  },

  // Conversation avec l'assistant
  chat: async (message, historique = []) => {
    const { data } = await api.post("/ia/chat", { message, historique });
    return data;
  },

  // --- RF-25 : analyse du cahier des charges ---
  // Options : { fichier: File } (import .doc/.docx/.pdf/.png/.jpg) ou { texte }
  analyserCdc: async (projetId, options = {}) => {
    if (options.fichier) {
      const form = new FormData();
      form.append("fichier", options.fichier);
      if (options.texte) form.append("texte", options.texte);
      const { data } = await api.post(
        `/ia/projets/${projetId}/analyser-cdc`,
        form,
      );
      return data;
    }
    const { data } = await api.post(`/ia/projets/${projetId}/analyser-cdc`, {
      texte: options.texte || null,
    });
    return data;
  },

  // --- RF-26 : extraction de tâches & suggestions ---
  extraireTaches: async (projetId, texte = null) => {
    const { data } = await api.post(`/ia/projets/${projetId}/extraire-taches`, {
      texte,
    });
    return data;
  },

  listerSuggestions: async (params = {}) => {
    const { data } = await api.get("/ia/suggestions", { params });
    return data;
  },

  validerSuggestion: async (suggestionId, responsableId = null) => {
    const { data } = await api.post(
      `/ia/suggestions/${suggestionId}/valider`,
      { responsable_id: responsableId || null },
    );
    return data;
  },

  rejeterSuggestion: async (suggestionId) => {
    const { data } = await api.post(`/ia/suggestions/${suggestionId}/rejeter`);
    return data;
  },

  // --- RF-27 : résumé de projet ---
  resumeProjet: async (projetId) => {
    const { data } = await api.post(`/ia/projets/${projetId}/resume`);
    return data;
  },

  // --- RF-28 : détection de retards / blocages ---
  detection: async (projetId) => {
    const { data } = await api.post(`/ia/projets/${projetId}/detection`);
    return data;
  },

  // --- RF-29 : proposition de statut santé ---
  statutPropose: async (projetId) => {
    const { data } = await api.post(`/ia/projets/${projetId}/statut-propose`);
    return data;
  },

  // --- RF-30 : aide à l'affectation ---
  affectation: async (tacheId) => {
    const { data } = await api.post(`/ia/taches/${tacheId}/affectation`);
    return data;
  },

  // --- RF-31 : recherche dans le projet ---
  recherche: async (projetId, q) => {
    const { data } = await api.get(`/ia/projets/${projetId}/recherche`, {
      params: { q },
    });
    return data;
  },

  // --- Disponibilité des membres autour d'une date ---
  disponibilites: async (projetId, dateStr) => {
    const { data } = await api.get(`/ia/projets/${projetId}/disponibilites`, {
      params: { date: dateStr },
    });
    return data;
  },
};