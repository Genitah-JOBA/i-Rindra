// src/api/projets.js
import api from './client'; // Import depuis votre client.js

export const projetsService = {
  // Liste des projets
  list: async () => {
    const response = await api.get('/projets');
    return response.data;
  },

  // Détail d'un projet
  get: async (id) => {
    const response = await api.get(`/projets/${id}`);
    return response.data;
  },

  // Créer un projet
  create: async (data) => {
    const response = await api.post('/projets', data);
    return response.data;
  },

  // Mettre à jour un projet
  update: async (id, data) => {
    const response = await api.put(`/projets/${id}`, data);
    return response.data;
  },

  // Supprimer un projet
  delete: async (id) => {
    const response = await api.delete(`/projets/${id}`);
    return response.data;
  },

  // Statistiques des projets
  getStats: async () => {
    const response = await api.get('/projets/stats');
    return response.data;
  },

  // Évolution des projets
  getEvolution: async () => {
    const response = await api.get('/projets/evolution');
    return response.data;
  },
};