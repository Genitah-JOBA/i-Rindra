// src/api/projets.js — appels REST liés aux projets (RF-05 à RF-10).
import api from "./client";

export const projetsService = {
  // Liste des projets accessibles à l'utilisateur
  list: async (params = {}) => {
    const { data } = await api.get("/projets/", { params });
    return data;
  },

  // Détail d'un projet
  get: async (id) => {
    const { data } = await api.get(`/projets/${id}`);
    return data;
  },

  // Créer un projet
  create: async (projet) => {
    const { data } = await api.post("/projets/", projet);
    return data;
  },

  // Mettre à jour un projet
  update: async (id, projet) => {
    const { data } = await api.put(`/projets/${id}`, projet);
    return data;
  },

  // Archiver / supprimer
  archiver: async (id) => {
    const { data } = await api.post(`/projets/${id}/archiver`);
    return data;
  },
  remove: async (id) => {
    await api.delete(`/projets/${id}`);
  },

  // Membres d'un projet
  getMembres: async (id) => {
    const { data } = await api.get(`/projets/${id}/membres`);
    return data;
  },
  addMembre: async (id, membre) => {
    const { data } = await api.post(`/projets/${id}/membres`, membre);
    return data;
  },
  removeMembre: async (id, utilisateurId) => {
    await api.delete(`/projets/${id}/membres/${utilisateurId}`);
  },
  // Utilisateurs pas encore membres (pour le sélecteur d'ajout)
  getMembresDisponibles: async (id) => {
    const { data } = await api.get(`/projets/${id}/membres/disponibles`);
    return data;
  },

  // --- Alias / no-op de compatibilité (utilisés par d'anciens écrans) ---
  delete: async (id) => projetsService.remove(id),
  getStats: async () => ({}), // endpoint inexistant : valeur neutre
  getEvolution: async () => [], // endpoint inexistant : valeur neutre
};
