// ProtectedRoute.jsx — protège les routes selon l'authentification et le rôle.
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  // Tant qu'on vérifie le token, on n'affiche rien (évite un flash vers /login).
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }

  // Non connecté -> vers la page de login (on mémorise la page demandée).
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Connecté mais rôle non autorisé -> accueil adapté au rôle (évite les boucles).
  if (roles && !roles.includes(user.role)) {
    const accueil = user.role === "client" ? "/mon-projet" : "/";
    return <Navigate to={accueil} replace />;
  }

  return children;
}
