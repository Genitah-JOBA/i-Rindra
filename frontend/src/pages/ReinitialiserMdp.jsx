// ReinitialiserMdp.jsx — étape 2 du flux de réinitialisation :
// l'utilisateur arrive via le lien reçu par email et choisit un nouveau mot de passe.
// Le jeton est à usage unique : une fois utilisé, le lien est invalidé.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import AuthShell, { BoutonPrincipal, Champ, LienRetour } from "../components/AuthShell";
import { authService } from "../auth/authService";

// Doit rester aligné avec backend/app/utils/mots_de_passe.py
const LONGUEUR_MIN = 8;

function validerMotDePasse(motDePasse) {
  if (!motDePasse) return "Le mot de passe est requis.";
  if (motDePasse.length < LONGUEUR_MIN)
    return `Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`;
  if (!/[A-Z]/.test(motDePasse))
    return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/[0-9]/.test(motDePasse))
    return "Le mot de passe doit contenir au moins un chiffre.";
  return "";
}

const CRITERES = [
  { test: (m) => m.length >= LONGUEUR_MIN, texte: `${LONGUEUR_MIN} caractères minimum` },
  { test: (m) => /[A-Z]/.test(m), texte: "Une majuscule" },
  { test: (m) => /[0-9]/.test(m), texte: "Un chiffre" },
];

export default function ReinitialiserMdp() {
  const { token } = useParams();
  const navigate = useNavigate();

  // null = vérification en cours, true = lien valide, false = lien mort
  const [jetonValide, setJetonValide] = useState(null);
  const [emailMasque, setEmailMasque] = useState(null);

  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mdpTouche, setMdpTouche] = useState(false);
  const [confirmationTouche, setConfirmationTouche] = useState(false);
  const [afficher, setAfficher] = useState(false);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const reponse = await authService.verifyResetToken(token);
        if (annule) return;
        setJetonValide(reponse.valide);
        setEmailMasque(reponse.email_masque || null);
      } catch {
        if (!annule) setJetonValide(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [token]);

  const erreurMdp = mdpTouche ? validerMotDePasse(motDePasse) : "";
  const erreurConfirmation =
    confirmationTouche && confirmation !== motDePasse
      ? "Les deux mots de passe ne correspondent pas."
      : "";
  const valide =
    validerMotDePasse(motDePasse) === "" && confirmation === motDePasse;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setMdpTouche(true);
    setConfirmationTouche(true);
    if (!valide) return;

    setEnCours(true);
    try {
      await authService.resetPassword(token, motDePasse);
      // Succès : on renvoie vers la connexion, qui affiche une confirmation.
      navigate("/login", { replace: true, state: { reinitialise: true } });
    } catch (err) {
      if (err.response?.status === 400) {
        // Lien invalide ou expiré : le backend le signale, on le dit clairement.
        setErreur(err.response.data?.detail || "Ce lien n'est plus valable.");
        setJetonValide(false);
      } else if (!err.response) {
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

  const pied = <LienRetour to="/login">← Retour à la connexion</LienRetour>;

  // --- Vérification du jeton en cours
  if (jetonValide === null) {
    return (
      <AuthShell titre="Nouveau mot de passe" sousTitre="Vérification du lien…" pied={pied}>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-i-blue" />
        </div>
      </AuthShell>
    );
  }

  // --- Lien invalide, expiré ou déjà utilisé
  if (jetonValide === false) {
    return (
      <AuthShell
        titre="Lien invalide"
        sousTitre="Ce lien de réinitialisation n'est plus valable."
        pied={pied}
      >
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p>
            Un lien de réinitialisation est valable{" "}
            <strong>30 minutes</strong> et <strong>une seule fois</strong>. Il a
            peut-être déjà été utilisé, expiré, ou été modifié au cours de son
            transfert.
          </p>
          <p className="mt-3 text-xs text-slate-600">
            Demandez un nouveau lien depuis la page{" "}
            <Link
              to="/mot-de-passe-oublie"
              className="font-semibold text-i-blue underline transition hover:text-i-primary"
            >
              mot de passe oublié
            </Link>
            .
          </p>
        </div>
      </AuthShell>
    );
  }

  // --- Formulaire
  return (
    <AuthShell
      titre="Nouveau mot de passe"
      sousTitre={
        emailMasque
          ? `Choisissez un nouveau mot de passe pour ${emailMasque}.`
          : "Choisissez un nouveau mot de passe."
      }
      pied={pied}
    >
      {erreur && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {erreur}
        </div>
      )}

      <form onSubmit={handleSubmit} className="font-body space-y-3.5" noValidate>
        <Champ label="Nouveau mot de passe" erreur={erreurMdp}>
          <div
            className={`flex gap-2 items-center w-full border-2 rounded-lg px-3 py-2.5 text-sm transition ${
              mdpTouche && erreurMdp
                ? "border-red-500 focus-within:ring-2 focus-within:ring-red-500/30"
                : "border-slate-300 focus-within:border-i-blue focus-within:ring-2 focus-within:ring-i-blue/30"
            }`}
          >
            <input
              type={afficher ? "text" : "password"}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              onBlur={() => setMdpTouche(true)}
              required
              autoComplete="new-password"
              className="w-full bg-transparent outline-none"
            />
            <button
              type="button"
              onClick={() => setAfficher(!afficher)}
              className="shrink-0 text-slate-400 transition hover:text-slate-600"
              aria-label={afficher ? "Masquer" : "Afficher"}
            >
              {afficher ? "Masquer" : "Afficher"}
            </button>
          </div>
        </Champ>

        {/* Critères de robustesse */}
        <ul className="flex flex-col gap-1">
          {CRITERES.map((critere) => {
            const ok = critere.test(motDePasse);
            return (
              <li
                key={critere.texte}
                className={`flex items-center gap-1.5 text-xs ${
                  ok ? "text-i-green" : "text-slate-400"
                }`}
              >
                <span className={ok ? "font-bold" : ""}>{ok ? "✓" : "•"}</span>
                {critere.texte}
              </li>
            );
          })}
        </ul>

        <Champ label="Confirmer le mot de passe" erreur={erreurConfirmation}>
          <div
            className={`flex items-center w-full border-2 rounded-lg px-3 py-2.5 text-sm transition ${
              confirmationTouche && erreurConfirmation
                ? "border-red-500 focus-within:ring-2 focus-within:ring-red-500/30"
                : "border-slate-300 focus-within:border-i-blue focus-within:ring-2 focus-within:ring-i-blue/30"
            }`}
          >
            <input
              type={afficher ? "text" : "password"}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              onBlur={() => setConfirmationTouche(true)}
              required
              autoComplete="new-password"
              className="w-full bg-transparent outline-none"
            />
          </div>
        </Champ>

        <BoutonPrincipal desactive={enCours || !valide} valide={valide}>
          {enCours ? "Enregistrement…" : "Réinitialiser le mot de passe"}
        </BoutonPrincipal>
      </form>
    </AuthShell>
  );
}
