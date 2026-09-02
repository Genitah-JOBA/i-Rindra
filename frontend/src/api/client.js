// client.js — instance axios centrale pour tous les appels à l'API FastAPI.
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

// Ajoute automatiquement le token JWT à chaque requête (RNF-02).
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si le token est invalide/expiré, on nettoie et on renvoie vers /login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const clientsService = {
  // Liste des clients
  list: async () => {
    const response = await api.get('/clients/');
    return response.data;
  },

  // Détail d'un client
  get: async (id) => {
    const response = await api.get(`/clients/${id}`);
    return response.data;
  },

  // Créer un client
  create: async (data) => {
    const response = await api.post('/clients/', data);
    return response.data;
  },

  // Mettre à jour un client
  update: async (id, data) => {
    const response = await api.put(`/clients/${id}`, data);
    return response.data;
  },

  // Supprimer un client
  delete: async (id) => {
    const response = await api.delete(`/clients/${id}`);
    return response.data;
  },
};

export default api;
