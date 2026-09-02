// src/api/taches.js
import api from './client';

export const tachesService = {
  // Liste des tâches
  list: async () => {
    const response = await api.get('/taches');
    return response.data;
  },

  // Tâches d'un projet
  listByProjet: async (projetId) => {
    const response = await api.get(`/taches/projet/${projetId}`);
    return response.data;
  },

  // Détail d'une tâche
  get: async (id) => {
    const response = await api.get(`/taches/${id}`);
    return response.data;
  },

  // Créer une tâche
  create: async (data) => {
    const response = await api.post('/taches', data);
    return response.data;
  },

  // Mettre à jour une tâche
  update: async (id, data) => {
    const response = await api.put(`/taches/${id}`, data);
    return response.data;
  },

  // Supprimer une tâche
  delete: async (id) => {
    const response = await api.delete(`/taches/${id}`);
    return response.data;
  },

  // Changer le statut d'une tâche
  changeStatus: async (id, statut) => {
    const response = await api.patch(`/taches/${id}/statut`, { statut });
    return response.data;
  },
};