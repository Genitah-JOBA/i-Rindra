# app/besti/__init__.py
"""
Liaison avec Besti (gestion commerciale externe).

Besti reste maître de ses comptes clients : ce module ne fait que refléter
ce que Besti déclare (webhook `user.*`) et lui demander de vérifier les
identifiants lors d'une connexion. Aucune décision d'identité, de rôle ou de
mot de passe n'est prise ici à partir des données reçues : iRindra ne fait
jamais de fusion automatique par email et n'accorde jamais un rôle autre que
« client ».
"""