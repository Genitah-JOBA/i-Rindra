# app/services/recherche_texte.py
"""
Recherche par mots-clés (RF-31, volet « exact »).

Pourquoi pas un simple ILIKE '%requête%' : la requête « date d'échéance » ne se
trouvait que si le texte contenait cette expression mot pour mot, accents
compris. Ici :
  - accents et majuscules sont ignorés (« echeance » = « Échéance ») ;
  - les mots vides sont retirés (« de », « la », « d' »…) ;
  - un mot de la requête correspond au début d'un mot du texte, ce qui couvre
    pluriels et dérivés (« tache » trouve « tâches », « livrable » « livrables ») ;
  - le score est la part des mots de la requête retrouvés dans le texte.
"""
import math
import re
import unicodedata
from typing import List

MOTS_VIDES = {
    "a", "au", "aux", "avec", "ce", "ces", "d", "dans", "de", "des", "du", "en", "est", "et", "il", "l", "la",
    "le", "les", "leur", "ma", "mes", "mon", "ne", "nos", "notre", "ou", "par", "pas", "pour", "qu", "que",
    "qui", "sa", "se", "ses", "son", "sur", "ta", "un", "une", "vos", "votre", "y",
}


def normaliser(texte: str) -> str:
    sans_accents = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode("ascii")
    return sans_accents.lower()


def mots(texte: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", normaliser(texte))


def mots_cles(requete: str) -> List[str]:
    """Mots significatifs de la requête, sans doublons, dans l'ordre."""
    vus, resultat = set(), []
    for m in mots(requete):
        if m not in MOTS_VIDES and m not in vus:
            vus.add(m)
            resultat.append(m)
    return resultat


def _correspond(mot_requete: str, mot_texte: str) -> bool:
    if mot_texte == mot_requete:
        return True
    # Préfixe seulement pour des mots assez longs (évite « a » → « accueil »)
    return len(mot_requete) >= 4 and mot_texte.startswith(mot_requete)


def score(cles: List[str], texte: str) -> float:
    """Part des mots-clés retrouvés dans le texte (0 à 1)."""
    if not cles:
        return 0.0
    mots_texte = set(mots(texte))
    trouves = sum(1 for c in cles if any(_correspond(c, m) for m in mots_texte))
    return trouves / len(cles)


def seuil(cles: List[str]) -> float:
    """Au moins la moitié des mots-clés (tous s'il n'y en a qu'un ou deux… sauf un sur deux)."""
    return math.ceil(len(cles) / 2) / len(cles) if cles else 1.0


def _normaliser_caractere(c: str) -> str:
    """Un caractère -> exactement un caractère (positions conservées)."""
    a = unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode("ascii")
    return a[0].lower() if a else " "


def extrait_autour(cles: List[str], texte: str, largeur: int = 220) -> str:
    """Morceau du texte centré sur le premier mot-clé trouvé (pour l'affichage)."""
    texte = " ".join((texte or "").split())
    # Normalisation caractère par caractère : même longueur que le texte d'origine,
    # pour que la position trouvée corresponde au bon endroit (’, –, œ… compris).
    norm = "".join(_normaliser_caractere(c) for c in texte)
    positions = [norm.find(c) for c in cles if norm.find(c) >= 0]
    if not positions:
        return texte[:largeur] + ("…" if len(texte) > largeur else "")
    debut = max(0, min(positions) - largeur // 3)
    morceau = texte[debut:debut + largeur]
    return ("…" if debut else "") + morceau + ("…" if debut + largeur < len(texte) else "")
