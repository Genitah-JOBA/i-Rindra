# tests/test_devis_pdf.py — PDF des devis (gabarit B-esti, charte i-Rindra)
from datetime import datetime
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.routers.auth import get_current_user_role
from app.services.devis_pdf import (extraire_conditions, extraire_devise, extraire_lignes, extraire_taux_tva,
                                    generer_pdf_devis, montant, numero_devis)

DEVIS_IA = """**Agence Bienfe**
| Qté | Désignation de la prestation | Prix Unitaire HT (Ar) | Total HT (Ar) |
| :-- | :--------------------------- | :-------------------- | :------------ |
| 1 | **Création du profil**<br>- Page vitrine<br>- Logo | 150,000 Ar | 150,000 Ar |
| 2 | **Fiches produits** | 250 000 Ar | 500 000 Ar |
| 10,5 j | Développement | 3 000 Ar | 31 500 Ar |
|  | **Total HT** |  | **681 500** |

| **Total HT** | **681 500 Ar** |
| TVA (20%) | 136 300 Ar |

### **CONDITIONS DE PAIEMENT ET DÉLAIS**
- 50% à la commande.
- Délai : 10 jours ouvrables.
"""


def test_extraction_des_lignes():
    lignes = extraire_lignes(DEVIS_IA)
    assert [l.designation for l in lignes] == ["Création du profil", "Fiches produits", "Développement"]
    assert lignes[0].details == ["Page vitrine", "Logo"]
    assert lignes[0].prix_unitaire == Decimal(150000)          # « 150,000 » = cent cinquante mille
    assert lignes[1].total == Decimal(500000)
    assert lignes[2].quantite == Decimal("10.5") and lignes[2].unite == "j"


def test_taux_tva_devise_et_conditions():
    assert extraire_taux_tva(DEVIS_IA) == Decimal(20)
    assert extraire_taux_tva("Aucune taxe") == Decimal(0)
    assert extraire_devise(DEVIS_IA, "EUR") == "Ar"   # montants rédigés en Ar : pas de conversion
    assert extraire_devise("Total : 1 200 €", "Ar") == "EUR"
    assert extraire_devise("Arrivée du projet", "EUR") == "EUR"
    assert extraire_conditions(DEVIS_IA) == ["50% à la commande.", "Délai : 10 jours ouvrables."]


def test_formats():
    assert montant(Decimal("54000"), "Ar") == "54 000 Ar"
    assert montant(Decimal("1234.5"), "EUR") == "1 234,50 EUR"
    assert numero_devis(3, datetime(2026, 10, 2)) == "D03/26"


def test_pdf_genere_avec_et_sans_tableau():
    commun = dict(devis_id=2, titre=None, statut="validee", cree_le=datetime(2026, 10, 2), modele="test",
                  client_nom="Entreprise Lucia", devise="Ar", projet_nom="Site vitrine")
    assert generer_pdf_devis(contenu=DEVIS_IA, **commun).startswith(b"%PDF")
    # Texte sans tableau exploitable : le contenu est repris tel quel, sans erreur
    assert generer_pdf_devis(contenu="Devis libre sans tableau.", **commun).startswith(b"%PDF")


def test_route_pdf_refusee_au_client():
    # Le PDF d'un devis validé est consultable par la direction, les chefs de projet
    # et l'équipe (voir test_devis_lecture.py) ; un compte client reste refusé.
    from app.routers.auth import get_current_user_id
    client = TestClient(app)
    app.dependency_overrides[get_current_user_role] = lambda: "client"
    app.dependency_overrides[get_current_user_id] = lambda: 1
    try:
        assert client.get("/suggestion-devis/1/pdf").status_code == 403
    finally:
        app.dependency_overrides.clear()
