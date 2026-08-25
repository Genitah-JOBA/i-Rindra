# database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.core.config import settings

# Création du moteur de connexion asynchrone
engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=True,  # Affiche les requêtes SQL dans la console (à désactiver en prod)
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base pour les modèle ORM
Base = declarative_base()

# Dépendance FastAPI
async def get_db():
    """
    Récupère une session BD.
    À utiliser dans les endpoints comme : 
    async def mon_endpoint(db: AsyncSession = Depends(get_db)):
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
