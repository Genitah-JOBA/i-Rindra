// Login.jsx — page de connexion
// Formulaire fonctionnel branché sur le backend + redirection selon le rôle.
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false); // Nouvel état

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      const { user } = await login(email, motDePasse);
      // Cloisonnement : le client va sur son espace, les autres sur le tableau de bord.
      const destination =
        user.role === "client"
          ? "/mon-projet"
          : location.state?.from?.pathname || "/";
      navigate(destination, { replace: true });
    } catch (err) {
      setErreur(
        err.response?.data?.detail || "Email ou mot de passe incorrect."
      );
    } finally {
      setEnCours(false);
    }
  };

  // Fonction pour basculer l'affichage du mot de passe
  const toggleAfficherMotDePasse = () => {
    setAfficherMotDePasse(!afficherMotDePasse);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden bg-white shadow-xl md:grid-cols-2">
        {/* COLONNE GAUCHE : formulaire */}
        <div className="flex flex-col justify-center p-8 sm:p-12 border">
          {/* Logo visible surtout en mobile (le panneau de droite est masqué) */}
          <img
            src="/logo2.png"
            alt="i-Rindra"
            className="mb-6 h-16 w-auto self-center md:hidden"
          />

          <h1 className="mb-1 text-2xl font-bold text-slate-900 text-center py-2">CONNEXION</h1>
          <p className="mb-6 text-sm text-slate-500 text-center">
            Accédez à votre espace i-Rindra.
          </p>

          {erreur && (
            <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {erreur}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="flex gap-1 block mb-2 w-full border border-slate-300 px-3 py-2.5 text-sm transition focus:border-[#00B2A0] focus:ring-2 focus:ring-[#00B2A0]/30">
                <img src="/adresse.png" alt="email" className="w-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="  vous@exemple.com"
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Mot de passe
              </label>
              <div className="flex items-center gap-1 w-full border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#00B2A0] focus:ring-2 focus:ring-[#00B2A0]/30">
                <img src="/fermer-a-cle.png" alt="email" className="w-6" />
                <input
                  type={afficherMotDePasse ? "text" : "password"}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="  ••••••••"
                  className="w-full bg-transparent outline-none"
                />
                {/* Bouton pour afficher/masquer le mot de passe */}
                <button
                  type="button"
                  onClick={toggleAfficherMotDePasse}
                  className="flex items-center justify-center p-1 text-slate-500 hover:text-slate-700 transition-colors"
                  aria-label={afficherMotDePasse ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {afficherMotDePasse ? (
                    // Icône "œil barré" (masquer)
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65"
                      />
                    </svg>
                  ) : (
                    // Icône "œil" (afficher)
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="block mx-auto text-right transition hover:text-[#ff0040] cursor-pointer text-[12px]">
              Mot de passe oublié
            </div>

            <button
              type="submit"
              disabled={enCours}
              className="block mx-auto bg-[#63B23E] py-3 px-5 text-sm font-semibold text-white transition hover:bg-[#3F894E] disabled:opacity-50"
            >
              {enCours ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>

        {/* COLONNE DROITE : panneau de marque (masqué en mobile) */}
        <div className="relative hidden flex-col items-center justify-center bg-[#3B3B3B] p-12 text-center md:flex border">
          <img
            src="/.png"
            alt="Logo i-Rindra"
            className="mb-6 w-56 max-w-full text-white"
          />
          <h2 className="text-xl font-semibold text-white">
            Gestion de projets assistée par l'IA
          </h2>
          <p className="mt-2 max-w-xs text-sm text-teal-100/80">
            Centralisez vos projets, suivez l'avancement et laissez l'assistant
            IA vous épauler.
          </p>
        </div>
      </div>
    </div>
  );
}