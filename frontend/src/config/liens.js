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

// Lien contextuel vers le projet d'origine dans B-estimation (RF-35).
// B-esti ouvre ses fiches projet par identifiant interne (/projects/:id) alors
// qu'i-Rindra ne reçoit que l'identifiant public (UUID) : par défaut le lien
// mène à la liste des projets (ou « Mes projets » pour le client) avec cet
// identifiant en paramètre. Dès que B-esti expose une route par identifiant
// public, il suffit de définir VITE_BESTI_LIEN_PROJET (« {id} » remplacé),
// ex. https://besti.bef4prod.com/projects/public/{id}.
// Session (RF-36) : B-esti garde sa session dans son propre navigateur ; un
// utilisateur déjà connecté à B-esti arrive directement sur la page.
const MODELE_LIEN_PROJET = import.meta.env.VITE_BESTI_LIEN_PROJET || "";

export const lienBestiProjet = (bestiProjetId, estClient = false) => {
  const base = `${BESTI_URL}/${estClient ? "my-projects" : "projects"}`;
  if (!bestiProjetId) return estClient ? `${BESTI_URL}/devis` : base;
  const id = encodeURIComponent(bestiProjetId);
  return MODELE_LIEN_PROJET ? MODELE_LIEN_PROJET.replace("{id}", id) : `${base}?projet=${id}`;
};
