// src/api/besti.js
import api from "./client";

export const bestiService = {
  // Teste la liaison avec Besti dans les deux sens (direction / DRH)
  testerLiaison: async () => {
    const { data } = await api.post("/besti/liaison/test");
    return data;
  },
};
