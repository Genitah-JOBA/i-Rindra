// src/api/utilisateurs.js
import api from './client';

export const utilisateursService = {
  // Liste des utilisateurs
  list: async () => {
    const response = await api.get('/utilisateurs');
    return response.data;
  },

  // Détail d'un utilisateur
  get: async (id) => {
    const response = await api.get(`/utilisateurs/${id}`);
    return response.data;
  },

  // Créer un utilisateur
  create: async (data) => {
    const response = await api.post('/utilisateurs', data);
    return response.data;
  },

  // Mettre à jour un utilisateur
  update: async (id, data) => {
    const response = await api.put(`/utilisateurs/${id}`, data);
    return response.data;
  },

  // Supprimer un utilisateur
  delete: async (id) => {
    const response = await api.delete(`/utilisateurs/${id}`);
    return response.data;
  },
};