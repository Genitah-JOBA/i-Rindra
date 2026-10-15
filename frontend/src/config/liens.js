// src/config/liens.js — adresses des applications liées à i-Rindra.
// Modifiables sans toucher au code via les variables d'environnement Vite
// (fichiers .env / .env.production), lues au moment du build.

const sansSlashFinal = (url) => url.replace(/\/+$/, "");

// B-estimation (B-esti) : devis et estimations
export const BESTI_URL = sansSlashFinal(import.meta.env.VITE_BESTI_URL || "https://besti.bef4prod.com");

// i-Resaka : messagerie (chat des projets)
export const ERESAKA_URL = sansSlashFinal(import.meta.env.VITE_ERESAKA_URL || "https://i-resaka.bef4prod.com");

// Chat d'un projet (RF-32 / RF-33). L'identifiant du projet est transmis dans
// l'adresse : i-Resaka n'a pas encore de canal par projet et ouvre son accueil,
// le paramètre sera exploité dès qu'il le prendra en charge.
export const lienChatProjet = (projetId) =>
  projetId ? `${ERESAKA_URL}/?projet=${encodeURIComponent(projetId)}` : ERESAKA_URL;
