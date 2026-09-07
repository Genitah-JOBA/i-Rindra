import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { LangProvider } from "./i18n/LangContext";
import { MessageProvider } from "./context/MessageContext"; // ⬅️ AJOUT
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <AuthProvider>
          <MessageProvider>
            <App />
          </MessageProvider>
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
