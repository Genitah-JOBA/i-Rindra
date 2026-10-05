// Login.jsx — page de connexion
// Formulaire fonctionnel branché sur le backend + redirection selon le rôle.
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "./Login.css";


export default function Login() {
  const { login } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false);

  // États pour la validation des champs
  const [emailTouche, setEmailTouche] = useState(false);
  const [motDePasseTouche, setMotDePasseTouche] = useState(false);

  // Fonction de validation de l'email
  const validerEmail = (email) => {
    if (email.length < 5) {
      return "L'email doit contenir au moins 5 caractères";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return "Veuillez entrer un email valide (ex: nom@domaine.com)";
    }
    return "";
  };

  // Fonction de validation du mot de passe
  // Volontairement laxiste : ici on AUTHENTIFIE, on ne DEFINIT PAS de mot de
  // passe. Appliquer la politique de robustesse (8 car., majuscule, chiffre)
  // ici bloquerait les comptes existants créés avant son introduction.
  const validerMotDePasse = (motDePasse) => {
    if (motDePasse.length < 5) {
      return "Le mot de passe doit contenir au moins 5 caractères";
    }
    return "";
  };

  // Obtenir les messages d'erreur
  const erreurEmail = emailTouche ? validerEmail(email) : "";
  const erreurMotDePasse = motDePasseTouche
    ? validerMotDePasse(motDePasse)
    : "";

  // Vérifier si le formulaire est valide
  const estFormulaireValide = () => {
    return (
      email.length >= 5 &&
      validerEmail(email) === "" &&
      validerMotDePasse(motDePasse) === ""
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");

    setEmailTouche(true);
    setMotDePasseTouche(true);

    const emailErr = validerEmail(email);
    const mdpErr = validerMotDePasse(motDePasse);

    if (emailErr || mdpErr) {
      setErreur("Veuillez corriger les erreurs du formulaire");
      return;
    }

    setEnCours(true);
    try {
      const { user } = await login(email, motDePasse);
      // Toujours l'accueil du rôle après connexion, jamais la dernière page consultée.
      const destination = user.role === "client" ? "/mon-projet" : "/";
      navigate(destination, { replace: true });
    } catch (err) {
      if (!err.response) {
        setErreur("Impossible de joindre le serveur. Vérifiez que le backend est démarré (http://localhost:8000).");
      } else if (err.response.status === 401) {
        setErreur("Email ou mot de passe incorrect.");
      } else {
        setErreur(err.response.data?.detail || "Une erreur est survenue.");
      }
    } finally {
      setEnCours(false);
    }
  };

  const toggleAfficherMotDePasse = () => {
    setAfficherMotDePasse(!afficherMotDePasse);
  };

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-i-primary via-i-primary to-[#1a3a5c] p-4">
      {/* Carte compacte : 2 colonnes d'environ 420 px sur grand écran */}
      <div className="grid w-full max-w-[1100px] max-h-full overflow-y-auto bg-white shadow-2xl md:grid-cols-2">
        {/* COLONNE GAUCHE : formulaire */}
        <div className="flex flex-col justify-center p-6 sm:p-8 bg-white">
          {/* Logo mobile */}
          <img
            src="/Logo-i-Rindra-couleur.png"
            alt="i-Rindra"
            className="mb-4 h-14 w-auto self-center md:hidden"
          />

          <h1 className="login-apparition font-brand mb-1 text-3xl font-bold text-center py-1 bg-gradient-to-r from-i-primary to-i-blue bg-clip-text text-transparent">
            Connexion
          </h1>
          <p
            className="login-apparition font-body mb-4 text-sm text-slate-500 text-center"
            style={{ "--delai": "0.08s" }}
          >
            Accédez à votre espace i-Rindra.
          </p>

          {erreur && (
            <div className="mb-4 bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {erreur}
            </div>
          )}

          {location.state?.reinitialise && (
            <div className="mb-4 bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              Mot de passe mis à jour. Vous pouvez vous connecter.
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="login-apparition font-body space-y-3.5"
            style={{ "--delai": "0.16s" }}
            noValidate
          >
            {/* Email */}
            <div>
              <label className="mb-1 text-sm font-medium text-slate-700">
                Email <span className="text-red-500">*</span>
              </label>
              <div
                className={`flex gap-2 items-center w-full border-2 px-3 py-2.5 text-sm transition ${
                  emailTouche && erreurEmail
                    ? "border-red-500 focus-within:ring-2 focus-within:ring-red-500/30"
                    : emailTouche && !erreurEmail
                      ? "border-i-green focus-within:ring-2 focus-within:ring-i-green/30"
                      : "border-slate-300 focus-within:border-i-blue focus-within:ring-2 focus-within:ring-i-blue/30"
                }`}
              >
                <img src="/adresse.png" alt="email" className="w-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailTouche) setEmailTouche(true);
                  }}
                  onBlur={() => setEmailTouche(true)}
                  required
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  className="w-full bg-transparent outline-none"
                  minLength={5}
                />
                {emailTouche && !erreurEmail && email.length > 0 && (
                  <svg
                    className="w-5 h-5 text-i-green"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              {emailTouche && erreurEmail && (
                <p className="mt-1 text-xs text-red-500">{erreurEmail}</p>
              )}
            </div>

            {/* Mot de passe */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Mot de passe <span className="text-red-500">*</span>
              </label>
              <div
                className={`flex items-center gap-2 w-full border-2 px-3 py-2.5 text-sm transition ${
                  motDePasseTouche && erreurMotDePasse
                    ? "border-red-500 focus-within:ring-2 focus-within:ring-red-500/30"
                    : motDePasseTouche && !erreurMotDePasse
                      ? "border-i-green focus-within:ring-2 focus-within:ring-i-green/30"
                      : "border-slate-300 focus-within:border-i-blue focus-within:ring-2 focus-within:ring-i-blue/30"
                }`}
              >
                <img src="/fermer-a-cle.png" alt="password" className="w-6" />
                <input
                  type={afficherMotDePasse ? "text" : "password"}
                  value={motDePasse}
                  onChange={(e) => {
                    setMotDePasse(e.target.value);
                    if (motDePasseTouche) setMotDePasseTouche(true);
                  }}
                  onBlur={() => setMotDePasseTouche(true)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-transparent outline-none"
                  minLength={5}
                />
                {motDePasseTouche &&
                  !erreurMotDePasse &&
                  motDePasse.length > 0 && (
                    <svg
                      className="w-5 h-5 text-i-green"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                {/* Bouton pour afficher/masquer le mot de passe */}
                <button
                  type="button"
                  onClick={toggleAfficherMotDePasse}
                  className="flex items-center justify-center p-1 text-slate-500 hover:text-i-blue transition-colors"
                  aria-label={
                    afficherMotDePasse
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                >
                  {afficherMotDePasse ? (
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
              {motDePasseTouche && erreurMotDePasse && (
                <p className="mt-1 text-xs text-red-500">{erreurMotDePasse}</p>
              )}
            </div>

            <div className="block mx-auto text-right">
              <Link
                to="/mot-de-passe-oublie"
                className="inline-block transition hover:text-i-blue cursor-pointer text-[12px] text-slate-500"
              >
                Mot de passe oublié ?
              </Link>
            </div>

            {/* Bouton connexion : CTA vert → turquoise (charte) */}
            <button
              type="submit"
              disabled={enCours || !estFormulaireValide()}
              className={`font-body flex items-center justify-center gap-2 block w-full py-2.5 px-5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
                estFormulaireValide()
                  ? "login-cta-reflet bg-brand-gradient-soft text-i-primary hover:brightness-105 cursor-pointer shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                  : "bg-gray-400 text-white cursor-not-allowed"
              }`}
            >
              {enCours && (
                <span
                  className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-b-2 border-current"
                  aria-hidden="true"
                />
              )}
              {enCours ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>

        {/* COLONNE DROITE : panneau de marque (masqué en mobile) */}
        <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-i-primary via-i-primary to-[#1a3a5c] p-8 text-center md:flex">
          {/* Fond « aurore » : dégradé de la charte qui ondule lentement */}
          <div className="login-aurore pointer-events-none absolute inset-0" aria-hidden="true" />

          {/* Signature de l'auteur : quasi invisible, se révèle au survol */}
          <span
            className="absolute bottom-1.5 right-2 z-10 cursor-default select-text font-special text-[9px] tracking-[0.3em] text-white/[0.07] transition-colors duration-700 hover:text-i-turquoise/70"
            title="Conçu par JRG"
          >
            JRG
          </span>

          <div className="relative z-10 flex flex-col items-center">
            {/* Logo blanc : fond bleu nuit → version blanche (charte) */}
            <div className="relative mb-6 flex h-32 w-32 items-center justify-center">
              {/* Halo tournant aux couleurs de la marque */}
              <span className="login-halo-logo absolute inset-0 rounded-full" aria-hidden="true" />
              <span className="absolute inset-[6px] rounded-full bg-i-primary" aria-hidden="true" />
              <img
                src="/Logo-i-Rindra-Blanc.png"
                alt="Logo i-Rindra"
                className="relative w-20 max-w-full"
              />
            </div>

            <h2 className="font-brand text-xl font-bold text-white mb-2">
              Gestion de projets{" "}
              <span className="bg-gradient-to-r from-i-blue to-i-green bg-clip-text text-transparent">
                assistée par l'IA
              </span>
            </h2>
            <p className="font-body mb-6 max-w-xs text-xs text-i-turquoise/80">
              L'IA analyse, propose des tâches ; votre équipe valide et avance.
            </p>

            {/* Points forts */}
            <div className="flex w-full max-w-xs flex-col gap-2">
              {[
                { texte: "Suivi en temps réel", couleur: "bg-i-green" },
                { texte: "Assistant IA intégré", couleur: "bg-i-blue" },
                { texte: "Espace client dédié", couleur: "bg-i-turquoise" },
              ].map((p, i) => (
                <div
                  key={p.texte}
                  className="login-apparition flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs text-white/80 backdrop-blur-sm"
                  style={{ "--delai": `${0.4 + i * 0.15}s` }}
                >
                  <span className={`h-1.5 w-1.5 ${p.couleur}`} />
                  {p.texte}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}