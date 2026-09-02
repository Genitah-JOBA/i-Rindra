// src/api/taches.js — appels REST liés aux tâches (RF-11 à RF-15).
import api from "./client";

export const tachesService = {
  // Liste des tâches d'un projet
  listByProjet: async (projetId) => {
    const { data } = await api.get(`/taches/projets/${projetId}/taches`);
    return data;
  },

  // Détail d'une tâche
  get: async (id) => {
    const { data } = await api.get(`/taches/${id}`);
    return data;
  },

  // Créer une tâche dans un projet
  create: async (projetId, tache) => {
    const { data } = await api.post(`/taches/projets/${projetId}/taches`, tache);
    return data;
  },

  // Mettre à jour une tâche
  update: async (id, tache) => {
    const { data } = await api.put(`/taches/${id}`, tache);
    return data;
  },

  // Supprimer une tâche
  remove: async (id) => {
    await api.delete(`/taches/${id}`);
  },

  // Changer le statut (Kanban) — le backend attend un query param `nouveau_statut`
  changeStatut: async (id, nouveauStatut) => {
    const { data } = await api.patch(`/taches/${id}/statut`, null, {
      params: { nouveau_statut: nouveauStatut },
    });
    return data;
  },

  // Affecter/réaffecter un responsable — query param `responsable_id`
  affecter: async (id, responsableId) => {
    const { data } = await api.patch(`/taches/${id}/affectation`, null, {
      params: { responsable_id: responsableId },
    });
    return data;
  },
};
