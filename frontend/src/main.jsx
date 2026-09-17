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
