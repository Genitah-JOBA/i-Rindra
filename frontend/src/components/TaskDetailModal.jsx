// src/components/TaskDetailModal.jsx — Détail d'une tâche + commentaires (RF-14).
import { useState, useEffect } from "react";
import { tachesService } from "../api/taches";
import { useLang } from "../i18n/LangContext";
import { useAuth } from "../auth/AuthContext";

const couleurPriorite = {
  basse: "bg-slate-100 text-slate-600",
  moyenne: "bg-yellow-100 text-yellow-700",
  haute: "bg-orange-100 text-orange-700",
  critique: "bg-red-100 text-red-700",
};

const couleurStatut = {
  a_faire: "bg-slate-100 text-slate-600",
  en_cours: "bg-blue-100 text-blue-700",
  en_revue: "bg-purple-100 text-purple-700",
  termine: "bg-green-100 text-green-700",
};

const labelStatut = {
  a_faire: "À faire",
  en_cours: "En cours",
  en_revue: "En revue",
  termine: "Terminée",
};

const labelPriorite = {
  basse: "Basse",
  moyenne: "Moyenne",
  haute: "Haute",
  critique: "Critique",
};

function formaterDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { 
    day: "2-digit", 
    month: "2-digit", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function TaskDetailModal({ 
  tache, 
  membres, 
  onClose, 
  onCommentaireAjoute,
  utilisateurs = [] 
}) {
  const { t: tr } = useLang();
  const { user } = useAuth();

  const [commentaires, setCommentaires] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [nouveau, setNouveau] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const chargerCommentaires = async () => {
    if (!tache) return;
    try {
      const data = await tachesService.listCommentaires(tache.id);
      console.log("Commentaires reçus:", data); // Pour déboguer
      setCommentaires(data || []);
    } catch (error) {
      console.error("Erreur chargement commentaires:", error);
      setCommentaires([]);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    chargerCommentaires();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tache?.id]);

  // Fonction pour obtenir le nom complet d'un utilisateur par son ID
  const getNomUtilisateur = (utilisateurId) => {
    if (!utilisateurId) return null;
    
    // Chercher dans les membres du projet (différents formats possibles)
    const membre = membres.find(m => 
      m.id === utilisateurId || 
      m.utilisateur_id === utilisateurId ||
      m.user_id === utilisateurId
    );
    if (membre) {
      return `${membre.prenom} ${membre.nom}`;
    }
    
    // Chercher dans la liste des utilisateurs
    const userData = utilisateurs.find(u => 
      u.id === utilisateurId ||
      u.user_id === utilisateurId
    );
    if (userData) {
      return `${userData.prenom} ${userData.nom}`;
    }
    
    // Si c'est l'utilisateur connecté
    if (user && user.id === utilisateurId) {
      return `${user.prenom} ${user.nom}`;
    }
    
    return null;
  };

  // Fonction pour obtenir le nom de l'auteur du commentaire
  const getNomAuteur = (commentaire) => {
    // Afficher les données du commentaire pour déboguer
    console.log("Commentaire:", commentaire);
    
    // Vérifier tous les champs possibles pour l'ID utilisateur
    const userId = commentaire.utilisateur_id || 
                   commentaire.auteur_id || 
                   commentaire.user_id ||
                   commentaire.createur_id ||
                   commentaire.created_by;
    
    if (userId) {
      const nom = getNomUtilisateur(userId);
      if (nom) {
        console.log(`Nom trouvé pour ID ${userId}:`, nom);
        return nom;
      }
    }
    
    // Vérifier si le commentaire contient déjà un nom
    const nom = commentaire.utilisateur_nom || 
                commentaire.auteur_nom || 
                commentaire.user_nom ||
                commentaire.createur ||
                commentaire.created_by_name;
    
    if (nom) {
      console.log("Nom trouvé directement:", nom);
      return nom;
    }
    
    // Si l'utilisateur connecté a créé le commentaire
    if (user && commentaire.auteur_id === user.id) {
      return `${user.prenom} ${user.nom}`;
    }
    
    console.warn("Aucun nom trouvé pour le commentaire:", commentaire);
    return "Utilisateur inconnu";
  };

  const nomResponsable = (responsableId) => {
    if (!responsableId) return null;
    const nom = getNomUtilisateur(responsableId);
    return nom || `#${responsableId}`;
  };

  const soumettre = async (e) => {
    e.preventDefault();
    if (!nouveau.trim()) return;
    setEnvoi(true);
    try {
      const c = await tachesService.ajouterCommentaire(tache.id, nouveau.trim());
      
      // Ajouter l'utilisateur actuel au commentaire pour l'affichage
      const commentaireAvecUser = {
        ...c,
        utilisateur_id: user?.id,
        utilisateur_nom: user ? `${user.prenom} ${user.nom}` : "Utilisateur inconnu",
        auteur_id: user?.id,
        auteur_nom: user ? `${user.prenom} ${user.nom}` : "Utilisateur inconnu",
      };
      
      setCommentaires((prev) => [...prev, commentaireAvecUser]);
      setNouveau("");
      onCommentaireAjoute?.();
    } catch (error) {
      console.error("Erreur envoi commentaire:", error);
      alert("Erreur lors de l'envoi du commentaire.");
    } finally {
      setEnvoi(false);
    }
  };

  const description = tache?.description?.trim();

  // Si les membres sont vides, essayer d'utiliser l'utilisateur connecté
  const membresAvecUser = membres.length > 0 ? membres : (user ? [user] : []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col bg-white shadow-xl  animate__animated animate__zoomIn">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {tache?.titre}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 font-medium  ${
                  couleurStatut[tache?.statut] || "bg-slate-100 text-slate-600"
                }`}
              >
                {labelStatut[tache?.statut] || tache?.statut}
              </span>
              <span
                className={`px-2 py-0.5 font-medium  ${
                  couleurPriorite[tache?.priorite] || "bg-slate-100 text-slate-600"
                }`}
              >
                {labelPriorite[tache?.priorite] || tache?.priorite}
              </span>
              {tache?.responsable_id && (
                <span className="text-slate-500 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  {nomResponsable(tache.responsable_id)}
                </span>
              )}
              {tache?.echeance && (
                <span className="text-slate-500 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  {formaterDate(tache.echeance)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100  transition-colors"
            aria-label="Fermer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Description */}
          {description && (
            <div className="mb-5">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {tr("taches.detail.description")}
              </h3>
              <p className="whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 p-3 ">
                {description}
              </p>
            </div>
          )}

          {/* Commentaires */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {tr("taches.detail.commentaires")} ({commentaires.length})
            </h3>

            {loadingComments ? (
              <div className="flex justify-center items-center py-4">
                <div className="animate-spin  h-5 w-5 border-b-2 border-[#63B23E]"></div>
                <span className="ml-2 text-sm text-slate-400">{tr("common.chargement")}</span>
              </div>
            ) : commentaires.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {tr("taches.detail.aucunCommentaire")}
              </p>
            ) : (
              <ul className="space-y-3">
                {commentaires.map((c) => {
                  const nomAuteur = getNomAuteur(c);
                  const initiales = nomAuteur !== "Utilisateur inconnu" 
                    ? nomAuteur.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2)
                    : '?';
                  
                  return (
                    <li key={c.id} className=" border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100 transition-colors">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {/* Avatar */}
                          <div className="w-6 h-6  bg-[#63B23E]/20 text-[#63B23E] flex items-center justify-center text-xs font-semibold">
                            {initiales}
                          </div>
                          <span className="text-xs font-semibold text-slate-700">
                            {nomAuteur}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {formaterDate(c.cree_le)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-700 pl-8">
                        {c.contenu}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Formulaire d'ajout */}
            <form onSubmit={soumettre} className="mt-4">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8  bg-[#63B23E] text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {user?.prenom?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="flex-1">
                  <textarea
                    value={nouveau}
                    onChange={(e) => setNouveau(e.target.value)}
                    placeholder={tr("taches.detail.placeholder")}
                    rows={2}
                    className="w-full resize-none border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#63B23E]  focus:ring-1 focus:ring-[#63B23E]"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={envoi || !nouveau.trim()}
                      className="bg-[#63B23E] px-4 py-2 text-sm font-semibold text-white  transition hover:bg-[#4a8f2e] disabled:opacity-50"
                    >
                      {envoi ? tr("common.enregistrement") : tr("taches.detail.envoyer")}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}