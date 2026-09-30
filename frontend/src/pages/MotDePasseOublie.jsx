// MotDePasseOublie.jsx — étape 1 du flux de réinitialisation :
// l'utilisateur saisit son email, le backend envoie un lien à usage unique.
import { useState } from "react";
import { Link } from "react-router-dom";

import AuthShell, { BoutonPrincipal, Champ, LienRetour } from "../components/AuthShell";
import { authService } from "../auth/authService";

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validerEmail(email) {
  if (!email) return "L'email est requis.";
  if (email.length < 5) return "L'email doit contenir au moins 5 caractères.";
  if (!RE_EMAIL.test(email)) return "Veuillez entrer un email valide (ex: nom@domaine.com).";
  return "";
}

export default function MotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [emailTouche, setEmailTouche] = useState(false);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  // Renseigné uniquement en développement : le backend renvoie alors le lien
  // dans la réponse faute de SMTP. En production ce champ reste undefined.
  const [lienDev, setLienDev] = useState(null);

  const erreurEmail = emailTouche ? validerEmail(email) : "";
  const valide = validerEmail(email) === "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEmailTouche(true);
    if (!valide) return;

    setEnCours(true);
    try {
      const reponse = await authService.forgotPassword(email.trim().toLowerCase());
      setEnvoye(true);
      if (reponse.lien_reinitialisation) setLienDev(reponse.lien_reinitialisation);
    } catch (err) {
      if (!err.response) {
        setErreur(
          "Impossible de joindre le serveur. Vérifiez que le backend est démarré (http://localhost:8000).",
        );
      } else {
        setErreur(err.response.data?.detail || "Une erreur est survenue.");
      }
    } finally {
      setEnCours(false);
    }
  };

  // --- Confirmation : le message est volontairement identique que l'email
  // existe ou non, sinon cette page permettrait d'énumérer les comptes.
  if (envoye) {
    return (
      <AuthShell
        titre="Vérifiez votre boîte"
        sousTitre="Nous avons envoyé un lien de réinitialisation."
        pied={
          <>
            <LienRetour to="/login">← Retour à la connexion</LienRetour>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-i-green/40 bg-green-50 px-3 py-2.5 text-sm text-green-800">
            Si un compte est associé à <strong>{email}</strong>, un lien vient
            d'être envoyé. Il est valable 30 minutes et ne peut être utilisé
            qu'une seule fois.
          </div>
          <p className="text-center text-xs text-slate-500">
            Rien reçu ? Vérifiez vos courriers indésirables, ou{" "}
            <button
              type="button"
              onClick={() => {
                setEnvoye(false);
                setLienDev(null);
              }}
              className="text-i-blue underline transition hover:text-i-primary"
            >
              réessayez avec une autre adresse
            </button>
            .
          </p>

          {lienDev && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <p className="font-semibold">Mode développement</p>
              <p className="mt-1">
                Aucun email n'est envoyé (SMTP non configuré). Utilisez ce lien :
              </p>
              <Link
                to={lienDev.replace(/^https?:\/\/[^/]+/, "")}
                className="mt-1 block break-all font-mono underline"
              >
                {lienDev}
              </Link>
            </div>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      titre="Mot de passe oublié"
      sousTitre="Indiquez l'email de votre compte, nous vous enverrons un lien de réinitialisation."
      pied={
        <LienRetour to="/login">← Retour à la connexion</LienRetour>
      }
    >
      {erreur && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {erreur}
        </div>
      )}

      <form onSubmit={handleSubmit} className="font-body space-y-3.5" noValidate>
        <Champ
          label="Email"
          erreur={erreurEmail}
          aide="L'adresse email utilisée pour vous connecter."
        >
          <div
            className={`flex gap-2 items-center w-full border-2 rounded-lg px-3 py-2.5 text-sm transition ${
              emailTouche && erreurEmail
                ? "border-red-500 focus-within:ring-2 focus-within:ring-red-500/30"
                : emailTouche && !erreurEmail
                  ? "border-i-green focus-within:ring-2 focus-within:ring-i-green/30"
                  : "border-slate-300 focus-within:border-i-blue focus-within:ring-2 focus-within:ring-i-blue/30"
            }`}
          >
            <img src="/adresse.png" alt="" className="w-5" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouche(true)}
              required
              autoComplete="email"
              placeholder="vous@exemple.com"
              className="w-full bg-transparent outline-none"
            />
          </div>
        </Champ>

        <BoutonPrincipal
          desactive={enCours || !valide}
          valide={valide}
        >
          {enCours ? "Envoi en cours…" : "Envoyer le lien"}
        </BoutonPrincipal>
      </form>
    </AuthShell>
  );
}
