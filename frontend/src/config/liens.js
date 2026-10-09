// src/config/liens.js — adresses des applications liées à i-Rindra.
// Modifiables sans toucher au code via les variables d'environnement Vite
// (fichiers .env / .env.production), lues au moment du build.

// B-estimation (B-esti) : devis et estimations
export const BESTI_URL = (import.meta.env.VITE_BESTI_URL || "https://besti.bef4prod.com").replace(/\/+$/, "");
