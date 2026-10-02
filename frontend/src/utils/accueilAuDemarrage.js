// accueilAuDemarrage.js — à chaque ouverture de l'application, on repart de
// l'accueil (tableau de bord), même si le navigateur rouvre la dernière page
// consultée. Seul un rechargement (F5) conserve la page courante.
//
// Un simple test « type de navigation === reload » ne suffit pas : selon le
// navigateur, la restauration des onglets à la réouverture peut elle aussi être
// vue comme un rechargement. On exige donc en plus que la page précédente ait
// été quittée il y a quelques secondes seulement (ce qui est le cas d'un F5,
// pas d'un navigateur fermé puis rouvert).

const CLE = "i-rindra:page-quittee-le";
const DELAI_RECHARGEMENT_MS = 30_000;

// Pages publiques : elles doivent rester accessibles telles quelles
// (ex. le lien de réinitialisation reçu par email).
const PAGES_PUBLIQUES = ["/login", "/mot-de-passe-oublie", "/reinitialiser-mdp"];

function lire() {
  try {
    return Number(localStorage.getItem(CLE)) || 0;
  } catch {
    return 0;
  }
}

function memoriserDepart() {
  try {
    localStorage.setItem(CLE, String(Date.now()));
  } catch {
    /* stockage indisponible : on redirigera simplement vers l'accueil */
  }
}

export function redirigerVersAccueilAuDemarrage() {
  const { pathname } = window.location;
  const estPublique = PAGES_PUBLIQUES.some((p) => pathname.startsWith(p));

  const nav = performance.getEntriesByType?.("navigation")?.[0];
  const estRechargement =
    nav?.type === "reload" && Date.now() - lire() < DELAI_RECHARGEMENT_MS;

  if (pathname !== "/" && !estPublique && !estRechargement) {
    // Avant le rendu de React : le routeur démarre directement sur "/".
    // (Un client sera ensuite renvoyé vers /mon-projet par ProtectedRoute.)
    window.history.replaceState(null, "", "/");
  }

  window.addEventListener("pagehide", memoriserDepart);
}
