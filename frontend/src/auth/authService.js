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

  // Mise à jour de MON profil (nom, prénom, email, mot de passe).
  async updateMe(data) {
    const res = await api.put("/auth/me", data);
    return res.data; // utilisateur mis à jour
  },

  // Étape 1 du flux mot de passe oublié : demande un lien par email.
  // Le backend répond toujours 200 avec le même message, que l'adresse existe
  // ou non — c'est volontaire, pour ne pas permettre d'énumérer les comptes.
  // En développement, `lien_reinitialisation` est renvoyé dans la réponse
  // (aucun SMTP requis) : on l'affiche pour pouvoir tester le flux.
  async forgotPassword(email) {
    const { data } = await api.post("/auth/mot-de-passe-oublie", { email });
    return data; // { message, lien_reinitialisation? }
  },

  // Vérifie qu'un lien est encore valable avant d'afficher le formulaire.
  async verifyResetToken(token) {
    const { data } = await api.get("/auth/verifier-jeton-reinit", {
      params: { token },
    });
    return data; // { valide: bool, email_masque?: string }
  },

  // Étape 2 : applique le nouveau mot de passe. Le lien est à usage unique.
  async resetPassword(token, nouveauMotDePasse) {
    const { data } = await api.post("/auth/reinitialiser-mdp", {
      token,
      nouveau_mot_de_passe: nouveauMotDePasse,
    });
    return data; // { message }
  },
};
