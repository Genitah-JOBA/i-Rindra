import { useState, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import { authService } from './authService';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Au chargement : si un token existe, on récupère l'utilisateur.
    const token = localStorage.getItem('token');
    if (token) {
      authService.getUser()
        .then((userData) => setUser(userData))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const response = await authService.login(email, password);
    localStorage.setItem('token', response.token);
    setUser(response.user);
    return response;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  // L'inscription ne connecte pas automatiquement (le backend ne renvoie
  // pas de token). On retourne le compte créé ; l'appelant redirige vers /login.
  const register = async (userData) => {
    return await authService.register(userData);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    register,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
