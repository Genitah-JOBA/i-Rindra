# tests/test_facture_pdf.py — PDF d'une facture (gabarit des devis, charte i-Rindra)
from datetime import date

import pytest

from app.models.facture import Facture, StatutFacture
from app.services.facture_pdf import generer_pdf_facture


def _facture(statut, echeance=date(2026, 10, 7), notes="Site vitrine : intégration et mise en ligne."):
    return Facture(numero="FAC-2026-0003", statut=statut, date_emission=date(2026, 9, 20),
                   date_echeance=echeance, montant_ht=6000000, taux_tva=20, montant_tva=1200000,
                   montant_ttc=7200000, notes=notes)


@pytest.mark.parametrize("statut", list(StatutFacture))
def test_pdf_genere_pour_chaque_statut(statut):
    pdf = generer_pdf_facture(_facture(statut), "Entreprise Lucia", "Site Web Kanto", devise="Ar")
    assert pdf.startswith(b"%PDF")


def test_pdf_sans_projet_ni_echeance_ni_notes():
    pdf = generer_pdf_facture(_facture(StatutFacture.BROUILLON, echeance=None, notes=None), None, None, devise="EUR")
    assert pdf.startswith(b"%PDF")
