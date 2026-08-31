// projets.js — appels REST liés aux projets (RF-05 à RF-10).
import api from "./client";

export const projetsService = {
  async list(params = {}) {
    const { data } = await api.get("/projets/", { params });
    return data;
  },

  async get(id) {
    const { data } = await api.get(`/projets/${id}`);
    return data;
  },

  async create(projet) {
    const { data } = await api.post("/projets/", projet);
    return data;
  },
};
