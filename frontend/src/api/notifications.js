// src/api/notifications.js
import api from "./client";

export const notificationsService = {
  // Mes notifications (50 plus récentes)
  list: async () => {
    const { data } = await api.get("/notifications/");
    return data;
  },

  // Nombre de non-lues (badge)
  count: async () => {
    const { data } = await api.get("/notifications/count");
    return data.non_lues || 0;
  },

  // Marquer une notification comme lue
  markRead: async (id) => {
    const { data } = await api.patch(`/notifications/${id}/lue`);
    return data;
  },

  // Tout marquer comme lu
  markAllRead: async () => {
    await api.patch("/notifications/toutes-lues");
  },
};
