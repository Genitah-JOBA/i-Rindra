# app/utils/mots_de_passe.py
"""
Politique de mot de passe — source unique de vérité côté backend.

Les règles étaient jusqu'ici dupliquées et divergentes (`min_length=4` dans
schemas/utilisateur.py, 8 caractères dans routers/auth.py, 5 côté frontend).
Elles sont regroupées ici et appliquées par tous les points d'entrée.
"""
import re

LONGUEUR_MIN = 8
LONGUEUR_MAX = 128  # au-delà, bcrypt ignore silencieusement les octets au-delà de 72


def verifier_mot_de_passe(mot_de_passe: str) -> str | None:
    """
    Retourne None si le mot de passe est conforme, sinon le message d'erreur
    à afficher à l'utilisateur.
    """
    if not mot_de_passe or len(mot_de_passe) < LONGUEUR_MIN:
        return f"Le mot de passe doit contenir au moins {LONGUEUR_MIN} caractères."

    if len(mot_de_passe) > LONGUEUR_MAX:
        return f"Le mot de passe ne peut pas dépasser {LONGUEUR_MAX} caractères."

    if not re.search(r"[A-Z]", mot_de_passe):
        return "Le mot de passe doit contenir au moins une majuscule."

    if not re.search(r"[0-9]", mot_de_passe):
        return "Le mot de passe doit contenir au moins un chiffre."

    return None
