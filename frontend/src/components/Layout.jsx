// Layout.jsx — cadre commun (barre de navigation + contenu) des pages connectées.
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const lienClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
  }`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // La direction et l'équipe voient les projets ; le client a son espace.
  const estInterne = user?.role === "direction" || user?.role === "equipe";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-slate-900">i-Rindra</span>
            <nav className="flex gap-1">
              {estInterne && (
                <>
                  <NavLink to="/" end className={lienClass}>
                    Tableau de bord
                  </NavLink>
                  <NavLink to="/projets" className={lienClass}>
                    Projets
                  </NavLink>
                </>
              )}
              {user?.role === "client" && (
                <NavLink to="/mon-projet" className={lienClass}>
                  Mon projet
                </NavLink>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {user?.prenom} {user?.nom}{" "}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                {user?.role}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
