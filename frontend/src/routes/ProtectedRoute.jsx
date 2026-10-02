// ProtectedRoute.jsx — protège les routes selon l'authentification et le rôle.
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// Écran d'attente du jeton. Distinct de l'erreur ci-dessous : ici on ne sait
// encore rien, l'API est simplement en train de répondre (et un hébergement
// gratuit peut mettre ~1 min à se réveiller) — on l'annonce clairement plutôt
// que d'afficher un texte nu qui donne l'impression d'un blocage.
function Attente() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-i-blue" />
      <p className="text-sm">Chargement…</p>
      <p className="max-w-xs px-6 text-center text-xs text-slate-400">
        Première connexion en cours. Si l'hébergement est en veille, le
        démarrage peut prendre jusqu&apos;à une minute.
      </p>
    </div>
  );
}

// L'API n'a pas répondu : on ne renvoie PAS vers /login (ce serait faire croire
// à une déconnexion alors que la session est intacte) et on propose de relancer.
function ApiInjoignable({ message, onRecharger }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6 text-red-600"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5-.217 3.374 1.948 3.374h14.71c2.165 0 3.374-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-i-primary">
          Serveur indisponible
        </h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {message} Votre session n&apos;est pas fermée — il s&apos;agit d&apos;un
          problème de connexion au serveur.
        </p>
      </div>
      <button
        onClick={onRecharger}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
      >
        Réessayer
      </button>
    </div>
  );
}

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user, loading, erreurBoot, rechargerUtilisateur } =
    useAuth();

  // Tant qu'on vérifie le token, on n'affiche rien (évite un flash vers /login).
  if (loading) return <Attente />;

  // L'API est injoignable : on bloque avec un diagnostic actionnable plutôt que
  // de rediriger vers /login et de faire perdre le token à l'utilisateur.
  if (erreurBoot) {
    return (
      <ApiInjoignable message={erreurBoot} onRecharger={rechargerUtilisateur} />
    );
  }

  // Non connecté -> vers la page de login (après connexion : tableau de bord).
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Connecté mais rôle non autorisé -> accueil adapté au rôle (évite les boucles).
  if (roles && !roles.includes(user.role)) {
    const accueil = user.role === "client" ? "/mon-projet" : "/";
    return <Navigate to={accueil} replace />;
  }

  return children;
}
