// Layout.jsx — Sidebar verticale avec menu hamburger responsive
import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import NotificationBell from "./NotificationBell";
import 'animate.css';

// Fonction pour les liens actifs
const lienClass = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
    isActive ? "bg-[#63B23E] text-white" : "text-white hover:bg-slate-600"
  }`;

// Composant pour les liens avec # (pages non encore créées)
const LienPlaceholder = ({ children, className, titre }) => (
  <a 
    href="#" 
    className={className}
    onClick={(e) => {
      e.preventDefault();
      alert(`🔄 La page "${titre}" est en cours de développement.`);
    }}
    title="Page en cours de développement"
  >
    {children}
  </a>
);

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
  const estDirection = user?.role === "direction";
  const estClient = user?.role === "client";

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
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      {/* Overlay sombre avec animation */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden animate__animated animate__fadeIn"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 1. SIDEBAR - En flex pour que le conteneur s'adapte */}
      <aside className={`
        w-72 sm:w-64 md:w-52
        bg-[#3B3B3B] border-r border-slate-600
        h-screen flex-shrink-0
        flex flex-col
        fixed md:relative left-0 top-0 z-40
        transition-transform duration-300 ease-in-out 
        md:translate-x-0
        shadow-2xl md:shadow-none
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Logo avec bouton de fermeture sur mobile */}
        <div className="p-4 border-b border-slate-600 flex justify-between items-center">
          <img
            src="/.png"
            alt="Logo i-Rindra"
            className="h-12 w-auto text-white"
          />
          {/* Bouton de fermeture visible uniquement sur mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"
            aria-label="Fermer le menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation avec scroll personnalisé */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto" onClick={() => setSidebarOpen(false)}>
          
          {/* === SECTION COMMUNE À TOUS === */}
          <div className="mb-2">
            <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Menu principal
            </p>
          </div>

          {/* Dashboard - pour tous les utilisateurs */}
          {estInterne ? (
            <NavLink to="/" end className={lienClass}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              Tableau de bord
            </NavLink>
          ) : (
            <NavLink to="/mon-projet" className={lienClass}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
              Mon projet
            </NavLink>
          )}

          {/* === SECTION INTERNE (Direction + Équipe) === */}
          {estInterne && (
            <>
              {/* Projets */}
              <NavLink to="/projets" className={lienClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                Projets
              </NavLink>

              {/* ✅ TÂCHES - MAINTENANT UN VRAI LIEN VERS LA PAGE */}
              <NavLink to="/taches" className={lienClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Tâches
              </NavLink>

              {/* Séparateur */}
              <div className="my-3 border-t border-slate-600"></div>

              {/* === SECTION GESTION === */}
              <div className="mb-2">
                <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Gestion
                </p>
              </div>

              {/* Membres - annuaire de l'équipe */}
              <NavLink to="/membres" className={lienClass}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                Membres
              </NavLink>

              {/* === SECTION IA === */}
              {estDirection && (
                <>
                  <div className="my-3 border-t border-slate-600"></div>
                  <div className="mb-2">
                    <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Intelligence Artificielle
                    </p>
                  </div>

                  {/* Assistant IA - en développement */}
                  <LienPlaceholder 
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-white hover:bg-slate-600 opacity-75`}
                    titre="Assistant IA"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    Assistant IA
                    <span className="ml-auto text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 flex-shrink-0">IA</span>
                  </LienPlaceholder>
                </>
              )}

              {/* === SECTION FINANCIÈRE (Direction uniquement) === */}
              {estDirection && (
                <>
                  <div className="my-3 border-t border-slate-600"></div>
                  <div className="mb-2">
                    <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Finance
                    </p>
                  </div>

                  {/* Devis/Estimations - redirection B-estimation */}
                  <a 
                    href="https://b-estimation.example.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-white hover:bg-slate-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h12m-12 2.25h12M3.375 4.5h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 01-1.125-1.125V5.625c0-.621.504-1.125 1.125-1.125z" />
                    </svg>
                    Devis & Estimations
                    <span className="ml-auto text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 flex-shrink-0">↗</span>
                  </a>

                  {/* Facturation - en développement */}
                  <LienPlaceholder 
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-white hover:bg-slate-600 opacity-75`}
                    titre="Facturation"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    </svg>
                    Facturation
                    <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 flex-shrink-0">Bientôt</span>
                  </LienPlaceholder>
                </>
              )}
            </>
          )}

          {/* === SECTION CLIENT === */}
          {estClient && (
            <>
              <div className="my-3 border-t border-slate-600"></div>
              <div className="mb-2">
                <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Mon espace
                </p>
              </div>

              {/* Chat - redirection e-resaka */}
              <a 
                href="https://e-resaka.example.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-white hover:bg-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511v.011m0 4.5v.011m0-4.5h-4.5m4.5 0h-4.5m0-4.5h4.5m0 0h-4.5m0 4.5h4.5m0 4.5h-4.5m4.5 0h-4.5m-9 4.5h4.5m-4.5 0h-4.5m4.5 0v-4.5m0 4.5V12m0-4.5h4.5m-4.5 0h-4.5m4.5 0v4.5m0 0h-4.5m0 4.5h4.5" />
                </svg>
                Chat (e-resaka)
                <span className="ml-auto text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 flex-shrink-0">↗</span>
              </a>

              {/* Devis - redirection B-estimation */}
              <a 
                href="https://b-estimation.example.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-white hover:bg-slate-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h12m-12 2.25h12M3.375 4.5h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 01-1.125-1.125V5.625c0-.621.504-1.125 1.125-1.125z" />
                </svg>
                Mes devis
                <span className="ml-auto text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 flex-shrink-0">↗</span>
              </a>

              {/* Documents - en développement */}
              <LienPlaceholder 
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-white hover:bg-slate-600 opacity-75`}
                titre="Documents"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Documents
                <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 flex-shrink-0">Bientôt</span>
              </LienPlaceholder>
            </>
          )}
        </nav>

        {/* Bas de la sidebar avec version */}
        <div className="p-3 border-t border-slate-600">
          <p className="text-xs text-slate-400 text-center">
            v0.1.0 · I-Rindra
          </p>
        </div>
      </aside>

      {/* 2. CONTENEUR PRINCIPAL - hauteur d'écran, seul le contenu défile */}
      <div className="flex-1 flex flex-col h-screen w-0 min-w-0">
        {/* Header supérieur avec menu déroulant */}
        <header className="border-b bg-white px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
          {/* Bouton Hamburger visible uniquement sur mobile */}
          <button 
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#63B23E] transition-colors"
            aria-label="Ouvrir le menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          {/* Cloche de notifications */}
          <div className="ml-auto">
            <NotificationBell />
          </div>

          {/* Profil avec menu déroulant */}
          <div className="relative" ref={profilMenuRef}>
            <button
              onClick={toggleProfilMenu}
              className="flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-[#63B23E]"
              aria-expanded={profilMenuOpen}
              aria-haspopup="true"
            >
              <span className="text-sm text-slate-700 font-medium hidden sm:inline">
                {user?.prenom} {user?.nom}
              </span>
              <span className="text-sm text-slate-700 font-medium sm:hidden">
                {user?.prenom?.charAt(0)}{user?.nom?.charAt(0)}
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
              <div className="absolute right-0 mt-2 w-56 bg-white shadow-lg border border-slate-200 py-1 z-50 animate__animated animate__fadeInDown">
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

                {/* Paramètres - en développement */}
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Paramètres
                  <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-600 px-2 py-0.5">Bientôt</span>
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
                    <img src="/france.png" alt="Drapeau France" className="w-5 h-5 object-cover" />
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
                    <img src="/RU.png" alt="Drapeau UK" className="w-5 h-5 object-cover" />
                    English
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

        {/* Corps de la page - seul cet espace défile */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-7xl w-full mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}