# app/models/mot_de_passe_reinit.py
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class MotDePasseReinit(Base):
    """
    Table 'mot_de_passe_reinit'
    Jeton à usage unique permettant de réinitialiser un mot de passe oublié.

    On ne stocke JAMAIS le jeton en clair : seule son empreinte SHA-256 est
    conservée. Une fuite de la table ne permet donc pas de réinitialiser le
    mot de passe de qui que ce soit. La ligne est supprimée dès l'utilisation
    (usage unique) et `expire_a` borne la fenêtre pendant laquelle le lien
    mailed reste valable.
    """
    __tablename__ = "mot_de_passe_reinit"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(
        Integer, ForeignKey("utilisateur.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # hexdigest SHA-256 du jeton opaque envoyé par email (64 caractères)
    token_hash = Column(String(64), nullable=False, index=True)
    expire_a = Column(DateTime(timezone=True), nullable=False)
    utilise_a = Column(DateTime(timezone=True), nullable=True)
    cree_le = Column(DateTime(timezone=True), server_default=func.now())

    utilisateur = relationship("Utilisateur")

    __table_args__ = (
        # Permet de purger efficacement les jetons expirés ou déjà consommés.
        Index("ix_mot_de_passe_reinit_utilisateur_utilise", "utilisateur_id", "utilise_a"),
    )

    @property
    def est_expire(self) -> bool:
        return self.expire_a is not None and self.expire_a < datetime.now(timezone.utc)

    def __repr__(self):
        return f"<MotDePasseReinit user {self.utilisateur_id} expire_a={self.expire_a}>"
