import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { MessageProvider } from "./context/MessageContext"; // ⬅️ AJOUT
import { ChronoProvider } from "./context/ChronoContext"; // ⬅️ AJOUT
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MessageProvider>
          <ChronoProvider>
            <App />
          </ChronoProvider>
        </MessageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Retire l'écran de démarrage statique (voir index.html) une fois React rendu.
// Sans cela il resterait affiché PAR-DESSUS l'application, en fixed inset:0.
// On attend le prochain frame pour ne pas laisser une frame blanche : React
// n'a pas encore peint au moment où render() retourne.
requestAnimationFrame(() => {
  document.getElementById("ecran-demarrage")?.remove();
});
