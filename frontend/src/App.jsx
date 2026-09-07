// App.jsx — définition des routes de l'application.
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MonProjet from "./pages/MonProjet";
import Projets from "./pages/Projets";
import Taches from "./pages/Taches";
import ProjetDetail from "./pages/ProjetDetail";
import Membres from "./pages/Membres";
import Clients from "./pages/Clients";
import Facturation from "./pages/Facturation";
import Parametres from "./pages/Parametres";

export default function App() {
  return (
    <Routes>
      {/* Page publique */}
      <Route path="/login" element={<Login />} />

      {/* Espace interne (admin + direction + équipe) */}
      <Route
        element={
          <ProtectedRoute roles={["admin", "direction", "equipe"]}>
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
      </Route>

      {/* Volet financier — ADMIN uniquement (la direction n'a pas accès à l'argent) */}
      <Route
        element={
          <ProtectedRoute roles={["admin"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/facturation" element={<Facturation />} />
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
      </Route>

      {/* Paramètres — accessible à tous les rôles connectés */}
      <Route
        element={
          <ProtectedRoute roles={["admin", "direction", "equipe", "client"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/parametres" element={<Parametres />} />
      </Route>

      {/* Tout le reste -> accueil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
