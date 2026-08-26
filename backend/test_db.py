import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def test():
    try:
        # Utiliser les variables individuelles
        conn = await asyncpg.connect(
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME", "Gestion_Projet"),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", 5432)
        )
        print("✅ Connexion réussie avec les variables individuelles !")
        await conn.close()
    except Exception as e:
        print(f"❌ Erreur avec les variables individuelles : {e}")

    try:
        # Utiliser DATABASE_URL
        url = os.getenv("DATABASE_URL")
        conn = await asyncpg.connect(dsn=url)
        print("✅ Connexion réussie avec DATABASE_URL !")
        await conn.close()
    except Exception as e:
        print(f"❌ Erreur avec DATABASE_URL : {e}")

import asyncio
asyncio.run(test())