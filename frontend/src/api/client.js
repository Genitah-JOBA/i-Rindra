// client.js — instance axios centrale pour tous les appels à l'API FastAPI.
import axios from "axios";

// Delai maximal d'attente d'une reponse de l'API, en millisecondes.
// SANS CE DELAI, axios ne resout ni ne rejette jamais une requete pendante :
// or `AuthProvider` garde l'ecran « Chargement… » tant que `loading` est vrai.
// Sur un hebergement gratuit qui dort (Render Free se met en veille apres
// 15 min sans trafic, ~1 min pour se reveiller), le premier appel peut rester
// pending tres longtemps — voire indefiniment si l'hote ne repond pas. L'ecran
// restait alors bloque indefiniment. Depasse ce delai, on leve l'echec pour que
// l'interface se decide (message explicite) au lieu de figer.
const TIMEOUT_PAR_DEFAUT = 15000;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || TIMEOUT_PAR_DEFAUT,
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
  },
);

export const clientsService = {
  // Liste des clients
  list: async () => {
    const response = await api.get("/clients/");
    return response.data;
  },

  // Détail d'un client
  get: async (id) => {
    const response = await api.get(`/clients/${id}`);
    return response.data;
  },

  // Créer un client
  create: async (data) => {
    const response = await api.post("/clients/", data);
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
