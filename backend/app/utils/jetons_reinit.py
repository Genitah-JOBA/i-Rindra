# app/utils/jetons_reinit.py
"""
Génération et vérification des jetons de réinitialisation de mot de passe.

Le jeton est une valeur opaque aléatoire (secrets.token_urlsafe) : elle n'a
aucune structure lisible, ce qui évite toute fuite d'information et rend
impossible sa fabrication à partir d'un identifiant connu (email, id...).

En base on ne conserve que son empreinte SHA-256. La comparaison se fait avec
`hmac.compare_digest` pour resisting aux attaques temporelles.
"""
import hashlib
import hmac
import secrets

# 32 octets aléatoires -> ~43 caractères URL-safe : assez court pour un lien
# lisible dans un email, assez long pour ne pas être devinable.
TAILLE_JETON_OCTETS = 32


def generer_jeton_reinit() -> tuple[str, str]:
    """
    Retourne un couple (jeton_en_clair, empreinte_sha256).

    - `jeton_en_clair` est mis dans le lien envoyé à l'utilisateur.
    - `empreinte_sha256` est la seule chose stockée en base.
    """
    jeton = secrets.token_urlsafe(TAILLE_JETON_OCTETS)
    return jeton, hacher_jeton_reinit(jeton)


def hacher_jeton_reinit(jeton: str) -> str:
    """Empreinte SHA-256 hexadécimale d'un jeton en clair."""
    return hashlib.sha256(jeton.encode("utf-8")).hexdigest()


def jeton_correspondant(jeton_en_clair: str, empreinte_attendue: str) -> bool:
    """Comparaison à temps constant entre le jeton reçu et l'empreinte stockée."""
    return hmac.compare_digest(hacher_jeton_reinit(jeton_en_clair), empreinte_attendue)
