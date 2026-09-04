# passenger_wsgi.py — point d'entrée pour o2switch (cPanel « Setup Python App » / Passenger).
#
# Passenger attend une application WSGI nommée `application`.
# FastAPI est une application ASGI : on la convertit avec a2wsgi (ASGIMiddleware).
#
# Pré-requis (dans le virtualenv de l'app Python cPanel) :
#   pip install -r requirements.txt
# (requirements.txt inclut a2wsgi et asyncpg)

from a2wsgi import ASGIMiddleware
from app.main import app as asgi_app

# L'objet que Passenger va servir
application = ASGIMiddleware(asgi_app)
