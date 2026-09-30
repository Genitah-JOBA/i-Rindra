# app/utils/email.py
"""
Envoi d'emails transactionnels (réinitialisation de mot de passe).

Transport : SMTP via `aiosmtplib` (async, compatible avec l'app FastAPI).
Sur o2switch/cPanel, renseigner les serveurs mail de l'hébergeur dans le .env :
    SMTP_HOST=mail.i-rindra.bef4prod.com
    SMTP_PORT=465
    SMTP_USE_SSL=true
    SMTP_USER=...   SMTP_PASSWORD=...

En développement (ou si le SMTP n'est pas configuré), l'envoi est court-circuité :
le contenu est écrit dans les logs. C'est ce qui permet de tester le flux de
réinitialisation sans serveur mail, tout en gardant le même appelant.
"""
import logging
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("i-rindra.email")


def smtp_configure() -> bool:
    """Vrai si les identifiants SMTP nécessaires sont présents."""
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def lien_reinitialisation(jeton: str) -> str:
    """Construit le lien absolu du formulaire de nouveau mot de passe."""
    return f"{settings.FRONTEND_URL}/reinitialiser-mdp/{jeton}"


def _corps_email_reinit(prenom: str, lien: str) -> tuple[str, str]:
    """(objet, corps texte) du message de réinitialisation."""
    objet = "i-Rindra — réinitialisation de votre mot de passe"
    corps = f"""Bonjour {prenom},

Vous avez demandé la réinitialisation de votre mot de passe i-Rindra.

Ouvrez le lien ci-dessous pour choisir un nouveau mot de passe :

{lien}

Ce lien est valable {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes et ne peut
être utilisé qu'une seule fois.

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre
mot de passe actuel reste valable et vous n'avez rien à faire.

L'équipe i-Rindra"""
    return objet, corps


async def envoyer_email_reinitialisation(destinataire: str, prenom: str, jeton: str) -> bool:
    """
    Envoie le lien de réinitialisation. Retourne True si l'email est parti.

    Ne lève pas d'exception : un échec SMTP ne doit pas révéler si une adresse
    existe (énumération de comptes) ni faire échouer la demande côté API.
    """
    lien = lien_reinitialisation(jeton)
    objet, corps = _corps_email_reinit(prenom, lien)

    if not smtp_configure():
        logger.warning(
            "SMTP non configuré — email NON envoyé à %s. Lien de réinitialisation : %s",
            destinataire,
            lien,
        )
        return False

    try:
        import aiosmtplib
    except ImportError:
        logger.exception(
            "aiosmtplib n'est pas installé : Impossible d'envoyer l'email. "
            "Lancez : pip install aiosmtplib"
        )
        return False

    message = EmailMessage()
    message["From"] = settings.EMAIL_EXPEDITEUR
    message["To"] = destinataire
    message["Subject"] = objet
    message.set_content(corps, subtype="plain", charset="utf-8")

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_USE_SSL,
            start_tls=settings.SMTP_STARTTLS and not settings.SMTP_USE_SSL,
        )
        logger.info("Email de réinitialisation envoyé à %s", destinataire)
        return True
    except Exception:
        logger.exception("Échec de l'envoi de l'email de réinitialisation à %s", destinataire)
        return False
