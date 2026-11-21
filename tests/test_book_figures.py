#!/usr/bin/env python3
"""Numeric regression tests against the book's published figures.

Every expected value below is a figure published in "Energy Not Enemy"
and registered in SPEC.md section 3 (the B-register) or section 4 (the
claims checklist). The simulation under test is the Python oracle in
oracle/model.py, an independent implementation of the model the book's
figures describe. Tolerances are stated per figure and are the
tolerances the project's own claims check (results/claims-check.json)
already uses where it has one.

One figure is recorded as a finding instead of a passing test: the
book's steady-state design-day net output (B-61, 27.6 kWh/day) is not
reproduced by the dynamic solver, which reaches 24.2 kWh on the third
consecutive day of the same weather (87.7 percent). That gap is the
documented C-03 PARTIAL verdict: the book's balance is steady-state
arithmetic with no warm-up, and the dynamic model spends its first
morning charging its water and steel inventory to the design point.
The finding test is marked as an expected failure so the gap stays
visible in every run; it is not tuned away.

Run: python3 -m unittest tests.test_book_figures (from the repo root),
or python3 tests/test_book_figures.py.
"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "oracle"))

from model import PARAMS, rankine_cycle  # noqa: E402

PP_TOL = 1.0  # percentage points, the claims-check tolerance for C-02


class TestRankineFigures(unittest.TestCase):
    """B-19 to B-26 and B-20: the Chapter 3 cycle table (claims C-02)."""

    def test_ideal_rankine_efficiency(self):
        eff = rankine_cycle(4.0, 400.0, 40.0, 1.0, 1.0)["efficiency"] * 100
        self.assertAlmostEqual(eff, 36.2, delta=PP_TOL,
                               msg=f"ideal {eff:.2f}% vs book 36.2% (B-19)")

    def test_realistic_rankine_efficiency(self):
        eff = rankine_cycle(4.0, 400.0, 40.0, 0.75, 0.65)["efficiency"] * 100
        self.assertAlmostEqual(eff, 27.1, delta=PP_TOL,
                               msg=f"realistic {eff:.2f}% vs book 27.1% (B-23)")

    def test_pessimistic_rankine_efficiency(self):
        eff = rankine_cycle(4.0, 400.0, 40.0, 0.55, 0.50)["efficiency"] * 100
        self.assertAlmostEqual(eff, 19.8, delta=PP_TOL,
                               msg=f"pessimistic {eff:.2f}% vs book 19.8% (B-26)")

    def test_carnot_ceiling(self):
        carnot = (1.0 - (40.0 + 273.15) / (400.0 + 273.15)) * 100
        self.assertAlmostEqual(carnot, 53.5, delta=0.5,
                               msg=f"Carnot {carnot:.2f}% vs book 53.5% (B-20)")


class TestOpticalChain(unittest.TestCase):
    """C-01 and B-09 to B-11: the Chapter 2 worked optics example."""

    def test_receiver_flux(self):
        delivered_w = 1000.0 * 1.0 * PARAMS["optical_eff"]
        receiver_m2 = 1.0 / PARAMS["concentration"]
        self.assertAlmostEqual(delivered_w, 750.0, delta=1e-9)
        self.assertAlmostEqual(delivered_w / receiver_m2, 45000.0, delta=1e-6,
                               msg="receiver flux vs book 45,000 W/m2 (B-11)")


class TestReferenceBalance(unittest.TestCase):
    """B-51 to B-64: the Chapter 11 reference energy balance, computed
    from the simulation's own parameters (PARAMS) by the book's chain:
    aperture beam, optics, receiver, Rankine shaft, generator,
    parasitics. Each stage is checked against its published figure."""

    def setUp(self):
        self.beam = 5.5 * 40.0  # B-42 design-day resource x B-46 aperture
        self.after_optics = self.beam * PARAMS["optical_eff"]
        self.heat = self.after_optics * PARAMS["receiver_eff"]
        cycle = rankine_cycle(4.0, 400.0, 40.0,
                              PARAMS["turbine_eff"], PARAMS["pump_eff"])
        self.shaft = self.heat * cycle["efficiency"]
        self.gross = self.shaft * PARAMS["generator_eff"]
        self.parasitics = 0.25 + 0.15 + 0.50  # B-57, B-58, B-59

    def test_beam_on_aperture(self):
        self.assertAlmostEqual(self.beam, 220.0, delta=2.0,
                               msg="vs book 220 kWh/day (B-51)")

    def test_after_optics(self):
        self.assertAlmostEqual(self.after_optics, 165.0, delta=2.0,
                               msg="vs book 165 kWh/day (B-52)")

    def test_heat_entering_cycle(self):
        self.assertAlmostEqual(self.heat, 111.0, delta=2.0,
                               msg="vs book 111 kWh/day (B-53)")

    def test_shaft_energy(self):
        self.assertAlmostEqual(self.shaft, 30.0, delta=1.5,
                               msg="vs book 30 kWh/day (B-54)")

    def test_gross_electrical(self):
        self.assertAlmostEqual(self.gross, 28.5, delta=1.5,
                               msg="vs book 28.5 kWh/day (B-56)")

    def test_net_passive_condenser(self):
        net = self.gross - self.parasitics
        self.assertAlmostEqual(net, 27.6, delta=1.5,
                               msg="vs book 27.6 kWh/day (B-61)")

    def test_net_forced_condenser(self):
        net = self.gross - self.parasitics - 2.0  # B-60 fan parasitic
        self.assertAlmostEqual(net, 25.6, delta=1.5,
                               msg="vs book 25.6 kWh/day (B-62)")

    def test_demand_coverage(self):
        coverage = (self.gross - self.parasitics) / 30.0 * 100  # B-01 demand
        self.assertAlmostEqual(coverage, 92.0, delta=5.0,
                               msg="vs book about 92% passive (B-63)")


class TestSizingFigures(unittest.TestCase):
    """C-04 and C-08: aperture, receiver, and condenser sizing."""

    def test_receiver_area(self):
        area = PARAMS["aperture_m2"] / PARAMS["concentration"]
        self.assertAlmostEqual(area, 0.67, delta=0.02,
                               msg="vs book about 0.67 m2 (B-47)")

    def test_chapter5_condenser_area(self):
        area = 50000.0 / (PARAMS["condenser_u"] * 20.0 * 10.0)
        self.assertAlmostEqual(area, 31.0, delta=1.0,
                               msg="vs book about 31 m2 (B-36)")

    def test_reference_condenser_area(self):
        area = 81000.0 / (PARAMS["condenser_u"] * 20.0 * 10.0)
        self.assertAlmostEqual(area, 51.0, delta=1.5,
                               msg="vs book about 51 m2 (B-49)")


class TestFindings(unittest.TestCase):
    """Figures the simulation does not reproduce, recorded as findings.
    Expected failure: the test encodes the book figure at the stated
    tolerance, and the dynamic solver's published result (24.2 kWh,
    results/claims-check.json, C-03) falls outside it."""

    @unittest.expectedFailure
    def test_dynamic_design_day_matches_book_net(self):
        dynamic_day3_kwh = 24.2  # claims-check.json C-03, third-day run
        self.assertAlmostEqual(dynamic_day3_kwh, 27.6, delta=1.5,
                               msg="FINDING C-03: dynamic solver reaches "
                                   "87.7% of the book's steady-state "
                                   "27.6 kWh/day (B-61)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
