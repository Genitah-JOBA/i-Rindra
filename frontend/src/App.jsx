// App.jsx — définition des routes de l'application.
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./routes/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MonProjet from "./pages/MonProjet";
import Projets from './pages/Projets';
import Taches from './pages/Taches';
import ProjetDetail from './pages/ProjetDetail';

export default function App() {
  return (
    <Routes>
      {/* Page publique */}
      <Route path="/login" element={<Login />} />

      {/* Espace interne (direction + équipe) */}
      <Route
        element={
          <ProtectedRoute roles={["direction", "equipe"]}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="projets" element={<Projets />} />
        <Route path="projets/:id" element={<ProjetDetail />} />
        <Route path="taches" element={<Taches />} />
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

      {/* Tout le reste -> accueil */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}