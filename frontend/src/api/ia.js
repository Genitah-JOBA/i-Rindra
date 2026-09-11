// src/api/ia.js — appels REST liés à l'assistant IA.
import api from "./client";

export const iaService = {
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
    const { data } = await api.post("/ia/chat", {
      message,
      historique,
    });
    return data;
  },
};
