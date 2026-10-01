# database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.core.config import settings
from app.core.url_db import port_pooler_pgbouncer, url_pour_sqlalchemy

# `DATABASE_URL` est défini une seule fois (Render, .env local, o2switch) et
# peut arriver avec ou sans le dialecte SQLAlchemy. C'est url_db qui traduit,
# pas une recherche de chaîne : voir app/core/url_db.py.
_connect_args = {}
if port_pooler_pgbouncer(settings.DATABASE_URL):
    # Pooler Supabase en mode transaction (port 6543) : PgBouncer ne gère
    # pas les « prepared statements », le cache d'asyncpg doit être coupé,
    # sinon on risque « cached plan must not change result type ».
    _connect_args["statement_cache_size"] = 0

# Création du moteur de connexion asynchrone
engine = create_async_engine(
    url_pour_sqlalchemy(settings.DATABASE_URL),
    echo=settings.APP_ENV == "development",  # Logs SQL uniquement en dev
    future=True,
    # Render Free endort le service (~15 min) et Supabase coupe les
    # connexions inactives : sans pre_ping, la 1re requête après réveil
    # échoue sur une connexion morte.
    pool_pre_ping=True,
    connect_args=_connect_args,
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
