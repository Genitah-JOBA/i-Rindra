# app/services/suppression_client.py — suppression définitive d'une fiche client.
#
# Utilisée par le webhook Besti `user.deleted` (client supprimé dans Besti) et
# par la suppression manuelle depuis l'écran Clients.
#
# Règle comptable : une fiche qui porte des factures n'est JAMAIS effacée (les
# factures émises doivent être conservées) ; l'appelant se rabat alors sur la
# désactivation.
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.facture import Facture
from app.models.projet import Projet
from app.models.suggestion_devis import SuggestionDevis
from app.models.utilisateur import Utilisateur


async def nb_factures(db: AsyncSession, client_id: int) -> int:
    return (
        await db.execute(select(func.count(Facture.id)).where(Facture.client_id == client_id))
    ).scalar_one()


async def supprimer_fiche_client(db: AsyncSession, client_id: int) -> bool:
    """
    Supprime la fiche, ses comptes clients, ses projets (tâches, jalons,
    fichiers, temps suivent par cascade en base) et ses suggestions de devis.
    Retourne False, sans rien toucher, si la fiche porte des factures.
    Ne valide pas : l'appelant commite.
    """
    if await nb_factures(db, client_id):
        return False
    await db.execute(delete(SuggestionDevis).where(SuggestionDevis.client_id == client_id))
    await db.execute(delete(Projet).where(Projet.client_id == client_id))
    await db.execute(delete(Utilisateur).where(Utilisateur.client_id == client_id))
    await db.execute(delete(Client).where(Client.id == client_id))
    return True
