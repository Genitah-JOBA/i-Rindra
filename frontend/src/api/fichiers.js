// src/api/fichiers.js — appels REST liés aux fichiers joints (RF-08).
import api from "./client";

export const fichiersService = {
  // Liste des fichiers d'un projet
  listByProjet: async (projetId) => {
    const { data } = await api.get(`/projets/${projetId}/fichiers`);
    return data;
  },

  // Détail d'un fichier
  get: async (projetId, fichierId) => {
    const { data } = await api.get(`/projets/${projetId}/fichiers/${fichierId}`);
    return data;
  },

  // Upload d'un fichier (multipart/form-data)
  upload: async (projetId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/projets/${projetId}/fichiers`, formData);
    return data;
  },

  // Téléchargement : récupère le blob et déclenche la sauvegarde locale
  telecharger: async (projetId, fichierId, nom = "fichier") => {
    const response = await api.get(
      `/projets/${projetId}/fichiers/${fichierId}/telecharger`,
      { responseType: "blob" },
    );
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = nom;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  // Supprimer un fichier
  remove: async (projetId, fichierId) => {
    await api.delete(`/projets/${projetId}/fichiers/${fichierId}`);
  },

  // Renommer un fichier — query param `nouveau_nom`
  renommer: async (projetId, fichierId, nouveauNom) => {
    const { data } = await api.post(
      `/projets/${projetId}/fichiers/${fichierId}/renommer`,
      null,
      { params: { nouveau_nom: nouveauNom } },
    );
    return data;
  },

  // Statistiques d'un projet
  statistiques: async (projetId) => {
    const { data } = await api.get(`/projets/${projetId}/fichiers/statistiques`);
    return data;
  },
};