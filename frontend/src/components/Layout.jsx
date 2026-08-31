// Layout.jsx — Sidebar verticale avec menu hamburger responsive
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import 'animate.css';

const lienClass = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-[#63B23E] text-white" : "text-white hover:bg-slate-600"
  }`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // État pour contrôler l'ouverture/fermeture du menu sur mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const estInterne = user?.role === "direction" || user?.role === "equipe";

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Overlay sombre en arrière-plan sur mobile quand la sidebar est ouverte */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 1. SIDEBAR VERTICALE RESPONSIVE */}
      <aside className={`w-52 bg-[#3B3B3B] border-r min-h-screen flex flex-col fixed left-0 top-0 z-40 transition-transform duration-300 ease-in-out md:translate-x-0 animate__animated animate__bounceInUp ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="p-4 border-b flex justify-between items-center">
          <img
            src="/.png" 
            alt="Logo i-Rindra"
            className="mb-6 w-20 max-w-full text-white rounded-[4px]"
          />
        </div>

        {/* Liens de navigation verticaux avec icônes */}
        <nav className="flex-1 p-1 space-y-1" onClick={() => setSidebarOpen(false)}>
          {estInterne && (
            <>
              <NavLink to="/" end className={lienClass}>
                {/* Icône Tableau de bord (Grid) */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                Tableau de bord
              </NavLink>

              <NavLink to="/projets" className={lienClass}>
                {/* Icône Projets (Dossier / Folder) */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                Projets
              </NavLink>
            </>
          )}

          {user?.role === "client" && (
            <NavLink to="/mon-projet" className={lienClass}>
              {/* Icône Mon projet (Document / User) */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Mon projet
            </NavLink>
          )}
        </nav>
      </aside>

      {/* 2. CONTENEUR PRINCIPAL (S'adapte : pas de marge sur mobile, ml-52 sur desktop) */}
      <div className="flex-1 md:ml-48 flex flex-col min-h-screen animate__animated animate__fadeInDownBig">
        {/* Header supérieur */}
        <header className="border-b bg-white px-6 py-4 flex justify-between md:justify-end items-center sticky top-0 z-30 shadow-sm">
          {/* Bouton Hamburger visible uniquement sur mobile */}
          <button 
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none"
            aria-label="Ouvrir le menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Profil et Déconnexion */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {user?.prenom} {user?.nom}{" "}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                {user?.role}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </header>

        {/* Corps de la page */}
        <main className="flex-1 p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}