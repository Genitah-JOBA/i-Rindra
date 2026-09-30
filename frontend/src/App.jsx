// App.jsx — définition des routes de l'application.
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { MessageProvider } from "./context/MessageContext";

// Chargement différé (`lazy`).
//
// Sans cela, les 17 pages étaient importées d'un bloc : Vite livrait alors un
// unique fichier de ~730 Ko à télécharger ET à analyser avant le premier
// affichage. Sur une connexion lente ou un hébergement mutualisé type o2switch,
// ce seul téléchargement suffisait à faire attendre l'utilisateur.
//
// Chaque page devient donc son propre chunk, chargé seulement quand on s'y
// rend. Le premier écran ne paie plus que React + le routeur + Layout + Login.
// `Layout` et `Login` restent « eagerly » chargés (import statique) : ils sont
// requis sur presque toutes les pages, les différer n'ajouterait qu'un aller-
// retour réseau sans rien gagner.
const MotDePasseOublie = lazy(() => import("./pages/MotDePasseOublie"));
const ReinitialiserMdp = lazy(() => import("./pages/ReinitialiserMdp"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MonProjet = lazy(() => import("./pages/MonProjet"));
const Documents = lazy(() => import("./pages/Documents"));
const Projets = lazy(() => import("./pages/Projets"));
const Taches = lazy(() => import("./pages/Taches"));
const ProjetDetail = lazy(() => import("./pages/ProjetDetail"));
const Membres = lazy(() => import("./pages/Membres"));
const Clients = lazy(() => import("./pages/Clients"));
const Absences = lazy(() => import("./pages/Absences"));
const Facturation = lazy(() => import("./pages/Facturation"));
const AssistantIA = lazy(() => import("./pages/AssistantIA/index.jsx"));
const SuggestionDevis = lazy(() => import("./pages/SuggestionDevis"));
const DevisEstimations = lazy(() => import("./pages/DevisEstimations"));
const Parametres = lazy(() => import("./pages/Parametres"));

// Affiché pendant le téléchargement d'un chunk de page. Volontairement sobre :
// ce n'est pas un blocage, c'est un aller-retour réseau de quelques dizaines de
// kilo-octets, tout au plus une fraction de seconde en connexion correcte.
function ChargementPage() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-i-blue" />
    </div>
  );
}

export default function App() {
  return (
    <MessageProvider>
      <Suspense fallback={<ChargementPage />}>
        <Routes>
        {/* Pages publiques */}
        <Route path="/login" element={<Login />} />
        {/* Réinitialisation du mot de passe : public, et volontairement hors de
            ProtectedRoute — un utilisateur bloqué dehors doit pouvoir y accéder. */}
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
        <Route path="/reinitialiser-mdp/:token" element={<ReinitialiserMdp />} />

        {/* Espace interne (direction + DRH + chef de projet + équipe) */}
        <Route
          element={
            <ProtectedRoute roles={["direction", "drh", "chef_de_projet", "equipe"]}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projets" element={<Projets />} />
          <Route path="projets/:id" element={<ProjetDetail />} />
          <Route path="taches" element={<Taches />} />
          <Route path="membres" element={<Membres />} />
          <Route path="clients" element={<Clients />} />
          <Route path="absences" element={<Absences />} />
          <Route path="assistant-ia" element={<AssistantIA />} />
        </Route>

        {/* Volet financier — Direction / DRH uniquement */}
        <Route
          element={
            <ProtectedRoute roles={["direction", "drh"]}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="facturation" element={<Facturation />} />
          <Route path="devis-estimations" element={<DevisEstimations />} />
          <Route path="suggestion-devis" element={<SuggestionDevis />} />
        </Route>

        {/* Espace client (cloisonné) */}
        <Route
          path="/mon-projet"
          element={
            <ProtectedRoute roles={["client"]}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<MonProjet />} />
          <Route path="documents" element={<Documents />} />
        </Route>

        {/* Paramètres — accessible à tous les rôles connectés */}
        <Route
          element={
            <ProtectedRoute roles={["direction", "drh", "chef_de_projet", "equipe", "client"]}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="parametres" element={<Parametres />} />
        </Route>

        {/* Tout le reste -> accueil */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </MessageProvider>
  );
}