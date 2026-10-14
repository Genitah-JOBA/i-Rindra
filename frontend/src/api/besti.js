// src/api/besti.js — liaison Besti (test, direction / DRH) et projets Besti
// en consultation seule : le client ne voit que ses projets, la gestion
// (direction, DRH, chef de projet) voit tous les projets.
import api from "./client";

export const bestiService = {
  // Teste la liaison avec Besti dans les deux sens (direction / DRH)
  testerLiaison: async () => {
    const { data } = await api.post("/besti/liaison/test");
    return data;
  },

  // Projets actifs, ou archivés avec `archives = true`
  listProjets: async (archives = false) => {
    const { data } = await api.get("/client/besti/projets", { params: { archives } });
    return data;
  },

  // Détail : statut, historique, cahiers des charges, fichiers et liens
  getProjet: async (projetId) => {
    const { data } = await api.get(`/client/besti/projets/${projetId}`);
    return data;
  },

  // Téléchargement relayé par iRindra (la clé Besti reste côté serveur)
  telechargerFichier: async (fichierId, nom = "fichier") => {
    const response = await api.get(`/client/besti/fichiers/${fichierId}`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = nom;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
