#!/usr/bin/env python3
# index.cgi

import sys
import os

# Ajoute le chemin du projet à PYTHONPATH
sys.path.insert(0, os.path.dirname(__file__))

# Active l'environnement virtuel (si tu en as un)
# activate_this = '/home/dev/env/bin/activate_this.py'
# with open(activate_this) as file_:
#     exec(file_.read(), dict(__file__=activate_this))

from app.main import app
from fastapi import FastAPI
from mangum import Mangum

# Mangum est un adaptateur pour exécuter FastAPI sur des environnements serverless/CGI
handler = Mangum(app)

if __name__ == "__main__":
    # Pour les tests en ligne de commande
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)