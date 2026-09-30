import { useState, useEffect, useCallback } from "react";
import { AuthContext } from "./AuthContext";
import { authService } from "./authService";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Renseignee quand l'API est INJOIGNABLE (veille de l'hebergement, timeout,
  // DNS, CORS). Distincte d'une session simplement expiree : dans ce cas on ne
  // doit pas effacer le jeton ni renvoyer vers /login, sinon l'utilisateur
  // croit avoir ete deconnecte alors que c'est l'API qui ne repond pas.
  const [erreurBoot, setErreurBoot] = useState(null);

  // `useCallback` : l'identite de la fonction est stable, donc le tableau de
  // dependances de l'effet ci-dessous ne se relance pas a chaque rendu.
  const chargerUtilisateur = useCallback(async () => {
    setLoading(true);
    setErreurBoot(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setUser(null);
        return;
      }
      setUser(await authService.getUser());
    } catch (err) {
      // `err.response` existe pour une erreur HTTP (401, 403, 500...) : le
      // jeton est alors rejete par l'API. Sans reponse, c'est un probleme
      // reseau : on ne touche pas au jeton, on affiche le diagnostic.
      if (err.response) {
        localStorage.removeItem("token");
        setUser(null);
      } else {
        setErreurBoot(
          err.code === "ECONNABORTED"
            ? "L'API n'a pas répondu à temps."
            : "Impossible de joindre l'API.",
        );
      }
    } finally {
      // `finally` garantit que `loading` retombe a false MEME en cas d'echec :
      // c'est ce qui empeche l'ecran « Chargement… » de rester fige.
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Le lint React interdit d'appeler une fonction qui pose un état de façon
    // SYNCHRONE dans le corps de l'effet (rendus en cascade). `chargerUtilisateur`
    // est `async` : jusqu'au premier `await`, elle s'exécute de façon synchrone,
    // donc le simple fait de l'appeler ici est signalé. On encapsule l'appel dans
    // un microtâche : l'effet ne pose alors plus d'état lui-même, et le premier
    // rendu (affichage de « Chargement… ») n'est pas annulé par un second rendu
    // immédiat issu du même effet.
    queueMicrotask(() => {
      chargerUtilisateur();
    });
  }, [chargerUtilisateur]);

  const login = async (email, password) => {
    const response = await authService.login(email, password);
    localStorage.setItem("token", response.token);
    setUser(response.user);
    return response;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setErreurBoot(null);
  };

  // L'inscription ne connecte pas automatiquement (le backend ne renvoie
  // pas de token). On retourne le compte créé ; l'appelant redirige vers /login.
  const register = async (userData) => {
    return await authService.register(userData);
  };

  // Met à jour MON profil puis rafraîchit l'utilisateur affiché.
  const updateMe = async (data) => {
    const updated = await authService.updateMe(data);
    setUser(updated);
    return updated;
  };

  const value = {
    user,
    loading,
    // Diagnostic d'API injoignable au demarrage + relance manuelle.
    erreurBoot,
    rechargerUtilisateur: chargerUtilisateur,
    login,
    logout,
    register,
    updateMe,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
