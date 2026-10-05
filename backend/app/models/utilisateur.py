# utilisateur.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.core.database import Base
from app.models._enum import pg_enum

# L'enum des r��les
class RoleUtilisateur(str, enum.Enum):
    DIRECTION = "direction"          # acc��s complet, Y COMPRIS le volet financier
    DRH = "drh"                      # acc��s complet, Y COMPRIS le volet financier
    CHEF_DE_PROJET = "chef_de_projet"  # pilotage opǸrationnel (sans facturation ni absences)
    EQUIPE = "equipe"                # membre affectǸ (dev, graphiste�?�)
    CLIENT = "client"                # entreprise cliente (acc��s �� son seul projet)

class Utilisateur(Base):
    """
    Table 'utilisateur'
    Contient tous les comptes qui se connectent �� la plateforme.
    """
    __tablename__ = "utilisateur"
    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(100), nullable=False)
    prenom = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    mot_de_passe_hash = Column(String(255), nullable=True)
    besti_id = Column(UUID(as_uuid=True), unique=True, nullable=True, index=True)
    role = Column(pg_enum(RoleUtilisateur, "role_utilisateur"), nullable=False, default=RoleUtilisateur.EQUIPE)
    client_id = Column(Integer, ForeignKey("client.id", ondelete="SET NULL"), nullable=True)
    # MǸtier du membre (dǸveloppeur, graphiste, intǸgrateur�?�) �?" sert �� savoir qui affecter �� une tǽche
    metier = Column(String(100), nullable=True)
    actif = Column(Boolean, default=True, nullable=False)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Utilisateur {self.email} ({self.role})>"