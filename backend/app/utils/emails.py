# app/utils/emails.py
"""
Normalisation des adresses email — source unique de vérité côté backend.

Pourquoi cette étape est nécessaire : la recherche d'un utilisateur se fait par
égalité exacte sur `utilisateur.email`. Tant que l'adresse n'est pas normalisée
à l'entrée, deux chemins qui devraient trouver le même compte peuvent échouer
différemment. Concrètement, `/mot-de-passe-oublie` normalisait déjà (minuscules)
alors que `/auth/login` et `/auth/register` ne le faisaient pas : un compte créé
avec « Jean.Dupont@Domaine.fr » pouvait se connecter mais ne recevait jamais son
lien de réinitialisation — le message générique promettait pourtant un email.

La forme canonique retenue est `lower(trim(...))`, celle déjà employée par le
flux de réinitialisation. Seule la casse est normalisée, pas la casse du domaine
seulement : c'est volontairement plus simple et cela couvre « Gmail » vs
« gmail », cause de loin la plus fréquente du symptôme décrit ci-dessus.
"""
import re

# Un email trop long est refusé par la plupart des serveurs SMTP ; on borne donc
# en amont pour ne pas créer de compte qui ne pourra jamais recevoir de lien.
LONGUEUR_MAX = 254

RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normaliser_email(email: str) -> str:
    """
    Retourne la forme canonique d'une adresse email.

    - `None`/vide devient la chaîne vide : à combiner avec une vérification
      d'erreur, jamais à insérer tel quel en base.
    - Ne lève jamais d'exception : la validation stricte reste du ressort des
      schémas Pydantic (`EmailStr`), cette fonction ne fait que canoniser.
    """
    if not email:
        return ""
    return email.strip().lower()


def email_valide(email: str) -> bool:
    """Vrai si l'adresse, une fois normalisée, ressemble à un email valide."""
    candidat = normaliser_email(email)
    return 0 < len(candidat) <= LONGUEUR_MAX and bool(RE_EMAIL.match(candidat))
