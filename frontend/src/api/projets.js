// src/api/projets.js — appels REST liés aux projets (RF-05 à RF-10, RF-24, RF-46).
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

  // Archiver / désarchiver
  archiver: async (id) => {
    const { data } = await api.post(`/projets/${id}/archiver`);
    return data;
  },
  desarchiver: async (id) => {
    const { data } = await api.post(`/projets/${id}/desarchiver`);
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

  // Transfert de la responsabilité du projet à un autre membre (RF-46)
  transfererResponsabilite: async (id, nouveauResponsableId) => {
    const { data } = await api.post(`/projets/${id}/transferer-responsabilite`, null, {
      params: { nouveau_responsable_id: nouveauResponsableId },
    });
    return data;
  },

  // Jalons du projet (RF-07)
  getJalons: async (id) => {
    const { data } = await api.get(`/projets/${id}/jalons`);
    return data;
  },
  getJalon: async (id, jalonId) => {
    const { data } = await api.get(`/projets/${id}/jalons/${jalonId}`);
    return data;
  },
  createJalon: async (id, jalon) => {
    const { data } = await api.post(`/projets/${id}/jalons`, { ...jalon, projet_id: Number(id) });
    return data;
  },
  updateJalon: async (id, jalonId, jalon) => {
    const { data } = await api.put(`/projets/${id}/jalons/${jalonId}`, jalon);
    return data;
  },
  removeJalon: async (id, jalonId) => {
    await api.delete(`/projets/${id}/jalons/${jalonId}`);
  },
  atteindreJalon: async (id, jalonId) => {
    const { data } = await api.post(`/projets/${id}/jalons/${jalonId}/atteindre`);
    return data;
  },
  reinitialiserJalon: async (id, jalonId) => {
    const { data } = await api.post(`/projets/${id}/jalons/${jalonId}/reinitialiser`);
    return data;
  },

  // Temps passé agrégé par membre et par tâche (RF-24)
  getTemps: async (id) => {
    const { data } = await api.get(`/projets/${id}/temps/synthese`);
    return data;
  },

  // --- Alias / no-op de compatibilité (utilisés par d'anciens écrans) ---
  delete: async (id) => projetsService.remove(id),
  getStats: async () => ({}), // endpoint inexistant : valeur neutre
  getEvolution: async () => [], // endpoint inexistant : valeur neutre
};
