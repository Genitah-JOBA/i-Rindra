// authService.js — appels réels à l'API d'authentification FastAPI.
import api from "../api/client";

export const authService = {
  // Connexion : l'endpoint /auth/login attend un formulaire OAuth2
  // (champs 'username' et 'password'), PAS du JSON.
  async login(email, password) {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);

    const { data } = await api.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    // On stocke le token immédiatement pour que getUser() soit authentifié.
    localStorage.setItem("token", data.access_token);
    const user = await this.getUser();
    return { token: data.access_token, user };
  },

  // Inscription : crée un compte. Le backend NE renvoie PAS de token ici,
  // l'utilisateur devra se connecter ensuite.
  // Pour un compte 'client', userData doit contenir client_id.
  async register(userData) {
    const { data } = await api.post("/auth/register", userData);
    return data; // { id, email, nom, prenom, role, message }
  },

  // Utilisateur courant à partir du token (JWT).
  async getUser() {
    const { data } = await api.get("/auth/me");
    return data; // { id, email, nom, prenom, role, actif, client_id }
  },
};
