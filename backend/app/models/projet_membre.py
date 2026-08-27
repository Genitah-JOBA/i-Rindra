# app/models/projet_membre.py
# La table 'projet_membre' est définie UNE SEULE FOIS dans projet.py
# (clé primaire composite projet_id + utilisateur_id, comme en base).
# Ce fichier ne fait que ré-exporter la classe pour les imports existants
# (ex. dashboard.py fait `from app.models.projet_membre import ProjetMembre`).
from app.models.projet import ProjetMembre  # noqa: F401
