// Layout.jsx — Sidebar verticale avec menu hamburger responsive
import { useState, useRef, useEffect } from "react";
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
  
  // État pour le menu déroulant du profil
  const [profilMenuOpen, setProfilMenuOpen] = useState(false);
  const profilMenuRef = useRef(null);

  // État pour la langue sélectionnée
  const [langue, setLangue] = useState("Français");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const estInterne = user?.role === "direction" || user?.role === "equipe";

  // Basculer le menu profil
  const toggleProfilMenu = () => {
    setProfilMenuOpen(!profilMenuOpen);
  };

  // Fermer le menu quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profilMenuRef.current && !profilMenuRef.current.contains(event.target)) {
        setProfilMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Changer la langue
  const changerLangue = (nouvelleLangue) => {
    setLangue(nouvelleLangue);
    setProfilMenuOpen(false);
    // Ici vous pouvez ajouter la logique pour changer la langue de l'application
    // Ex: i18n.changeLanguage(nouvelleLangue === "Français" ? "fr" : "en")
  };

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
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                Tableau de bord
              </NavLink>

              <NavLink to="/projets" className={lienClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                Projets
              </NavLink>
            </>
          )}

          {user?.role === "client" && (
            <NavLink to="/mon-projet" className={lienClass}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Mon projet
            </NavLink>
          )}
        </nav>
      </aside>

      {/* 2. CONTENEUR PRINCIPAL */}
      <div className="flex-1 md:ml-48 flex flex-col min-h-screen animate__animated animate__fadeInDownBig">
        {/* Header supérieur avec menu déroulant */}
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

          {/* Profil avec menu déroulant */}
          <div className="relative" ref={profilMenuRef}>
            <button
              onClick={toggleProfilMenu}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-slate-100 transition-colors focus:outline-none"
              aria-expanded={profilMenuOpen}
              aria-haspopup="true"
            >
              <span className="text-sm text-slate-700 font-medium">
                {user?.prenom} {user?.nom}
              </span>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                strokeWidth={2} 
                stroke="currentColor" 
                className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${profilMenuOpen ? 'rotate-180' : ''}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {/* Menu déroulant */}
            {profilMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 animate__animated animate__fadeInDown">
                {/* Information utilisateur */}
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900">
                    {user?.prenom} {user?.nom}
                  </p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>

                {/* Rôle */}
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  <span>Rôle : <span className="font-medium capitalize">{user?.role}</span></span>
                </button>

                {/* Paramètres */}
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Paramètres
                </button>

                {/* Langue avec sous-menu */}
                <div className="border-t border-slate-100 pt-1">
                  <div className="px-4 py-2">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Langue</p>
                  </div>
                  <button
                    onClick={() => changerLangue("Français")}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                      langue === "Français" 
                        ? "bg-[#63B23E]/10 text-[#63B23E] font-medium" 
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <img src="/france.png" alt="" />
                    Français
                    {langue === "Français" && (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 ml-auto text-[#63B23E]">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => changerLangue("English")}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                      langue === "English" 
                        ? "bg-[#63B23E]/10 text-[#63B23E] font-medium" 
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <img src="/RU.png" alt="" />
                    Anglais
                    {langue === "English" && (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 ml-auto text-[#63B23E]">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Séparateur et Déconnexion */}
                <div className="border-t border-slate-100 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                    Déconnexion
                  </button>
                </div>
              </div>
            )}
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