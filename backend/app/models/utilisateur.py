# utilisateur.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base
from app.models._enum import pg_enum

# L'enum des rôles
class RoleUtilisateur(str, enum.Enum):
    DIRECTION = "direction"
    EQUIPE = "equipe"
    CLIENT = "client"

class Utilisateur(Base):
    """
    Table 'utilisateur'
    Contient tous les comptes qui se connectent à la plateforme.
    """
    __tablename__ = "utilisateur"
    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    mot_de_passe_hash = Column(String(255), nullable=False)
    role = Column(pg_enum(RoleUtilisateur, "role_utilisateur"), nullable=False, default=RoleUtilisateur.EQUIPE)
    client_id = Column(Integer, ForeignKey("client.id", ondelete="SET NULL"), nullable=True)
    # Métier du membre (développeur, graphiste, intégrateur…) — sert à savoir qui affecter à une tâche
    metier = Column(String(100), nullable=True)
    actif = Column(Boolean, default=True, nullable=False)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Utilisateur {self.email} ({self.role})>"