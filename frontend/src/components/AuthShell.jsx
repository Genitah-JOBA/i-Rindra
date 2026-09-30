// AuthShell.jsx — coquille commune aux pages publiques d'authentification
// (connexion, mot de passe oublié, nouveau mot de passe).
// Split-screen : formulaire à gauche, panneau de marque à droite (masqué en mobile).
import { Link } from "react-router-dom";

export default function AuthShell({ titre, sousTitre, children, pied }) {
  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-i-primary via-i-primary to-[#1a3a5c] p-4">
      <div className="grid w-full max-w-7xl max-h-full overflow-hidden bg-white shadow-2xl md:grid-cols-2 rounded-2xl">
        {/* COLONNE GAUCHE : formulaire */}
        <div className="flex flex-col justify-center p-5 sm:p-8 bg-white">
          {/* Logo mobile */}
          <img
            src="/Logo-i-Rindra-couleur.png"
            alt="i-Rindra"
            className="mb-4 h-14 w-auto self-center md:hidden"
          />

          <h1 className="font-brand mb-1 text-3xl font-bold text-center py-1 bg-gradient-to-r from-i-primary to-i-blue bg-clip-text text-transparent">
            {titre}
          </h1>
          {sousTitre && (
            <p className="font-body mb-4 text-sm text-slate-500 text-center">
              {sousTitre}
            </p>
          )}

          {children}

          {pied && (
            <div className="mt-4 text-center text-[12px] text-slate-500">
              {pied}
            </div>
          )}
        </div>

        {/* COLONNE DROITE : panneau de marque (masqué en mobile) */}
        <div className="relative hidden flex-col items-center justify-center bg-gradient-to-br from-i-primary via-i-primary to-[#1a3a5c] p-8 text-center md:flex overflow-hidden">
          {/* Motifs décoratifs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-i-turquoise rounded-full filter blur-3xl opacity-10 -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-i-green rounded-full filter blur-3xl opacity-10 translate-y-1/2 -translate-x-1/2" />
          <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-i-blue rounded-full filter blur-3xl opacity-10 -translate-x-1/2 -translate-y-1/2" />

          {/* Contenu */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Logo blanc : fond bleu nuit → version blanche (charte) */}
            <div className="mb-8 p-4 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
              <img
                src="/Logo-i-Rindra-Blanc.png"
                alt="Logo i-Rindra"
                className="w-48 max-w-full"
              />
            </div>

            <h2 className="font-brand text-2xl font-bold text-white mb-3">
              Gestion de projets
              <span className="block bg-gradient-to-r from-i-blue to-i-green bg-clip-text text-transparent">
                assistée par l'IA
              </span>
            </h2>
            <p className="font-body mt-2 max-w-xs text-sm text-i-turquoise/80">
              Centralisez vos projets, suivez l'avancement et laissez
              l'assistant IA vous épauler.
            </p>

            {/* Points forts */}
            <div className="mt-8 flex flex-col gap-2 w-full max-w-xs">
              <div className="flex items-center gap-2 text-left text-xs text-white/80">
                <div className="w-1.5 h-1.5 rounded-full bg-i-green" />
                <span>Suivi en temps réel</span>
              </div>
              <div className="flex items-center gap-2 text-left text-xs text-white/80">
                <div className="w-1.5 h-1.5 rounded-full bg-i-blue" />
                <span>Assistant IA intégré</span>
              </div>
              <div className="flex items-center gap-2 text-left text-xs text-white/80">
                <div className="w-1.5 h-1.5 rounded-full bg-i-turquoise" />
                <span>Espace client dédié</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Champ({ label, erreur, aide, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label} <span className="text-red-500">*</span>
      </label>
      {children}
      {erreur && <p className="mt-1 text-xs text-red-500">{erreur}</p>}
      {aide && !erreur && <p className="mt-0.5 text-xs text-slate-400">{aide}</p>}
    </div>
  );
}

export function BoutonPrincipal({ children, desactive, valide }) {
  return (
    <button
      type="submit"
      disabled={desactive}
      className={`font-body block w-full py-2.5 px-5 text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 ${
        valide
          ? "bg-brand-gradient-soft text-i-primary hover:brightness-105 cursor-pointer shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          : "bg-gray-400 text-white cursor-not-allowed"
      }`}
    >
      {children}
    </button>
  );
}

export function LienRetour({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[12px] text-slate-500 transition hover:text-i-blue"
    >
      {children}
    </Link>
  );
}
