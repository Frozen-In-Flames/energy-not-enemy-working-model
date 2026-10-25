# Release notes, version one (v1.0.0)

Energy Not Enemy: The Working Model, first release. Local release only:
this version was committed for the owner's verification and has not been
pushed or tagged.

## What shipped, and why

**The book, mined first (`SPEC.md`).** Why: the owner's rule is that the
book's design is the specification, so nothing was simulated until the
book had been read end to end and its numbers extracted. Result: 68
book-stated parameters with chapter and page, a 12-claim quantitative
checklist, and a 30-entry assumption register for every value the book
leaves open. Every later disagreement can be traced to a line in this
file.

**A C++ solver core (`src/`).** Why: the solver is the product's center of
gravity, and C++ with the standard math library keeps it fast (the full
8,784-hour Lewisville year solves in about 0.8 seconds), portable, and
free of any third-party physics dependency. It implements solar position,
Fresnel concentration, a two-phase lumped boiler that rides the saturation
curve up to the 4 MPa design point and then superheats, hand-coded steam
correlations, a Reynolds-dependent Tesla valve with the book's diodicity
curve, a turbine on enthalpy drop, a dynamic air-cooled condenser, the
night return, and a gram-exact water ledger.

**An independent Python oracle (`oracle/`).** Why: one implementation can
be wrong in one direction and never notice. A second implementation of
the same lumped model, standard library only, sharing no code, is the
cheapest strong check available. The two agree to the printed digit on
every reference scenario.

**A JavaScript port and a hand-rolled WebGL page (`docs/`).** Why not
WebAssembly: the build machine has `g++` but no `clang++`, `em++`, or
`wasm-ld` (checked 2026-10-24), so the single-source route did not exist.
The port is therefore a third implementation, and the battery holds all
three to identical summary digests. The page renders every manufactured
part from the specification's dimensions, animates only from solver state
(sun and beams from computed irradiance and sun position, steam and water
particles from computed flows, turbine speed proportional to computed
rpm, droplets from computed condensation, night state from the solver),
and measures energy at seven phases with the equation and live inputs
behind every number.

**Live city data (Open-Meteo Archive primary, NASA POWER fallback).**
Why: the owner directed that the city be a user input and the weather be
real, up to two full years, cached on device. Both endpoints were
verified from the browser's position before the choice was made. The
bundled Lewisville 2024 year remains the instant default, labeled as
bundled with its provenance, so the page demonstrates with zero waiting.

**The book, included (`book/`).** Why: the owner directed it, knowing it
makes the book free in this repository. The strategy is dual-path, free
here and paid through storefronts. Licensing is fenced in `book/README.md`
and `LICENSE.md`: the book is all rights reserved and is not covered by
the code license.

**A verification battery (`tests/run_battery.py`).** Why: claims need
receipts. 38 checks: parity across three implementations, determinism
(byte-identical digests on repeat runs), negative controls, energy
balance closure on every scenario, steam and solar sanity checks against
hand-computable references, the claims checklist, and the annual run
sliced by month and day. Output is written to `results/`.

**A presentation video (`demo/`).** Why: the owner asked for a video of
the model being used, as a presentation a first-time viewer can follow.
It walks the parts, the day shift phase by phase, the night shift and the
water coming home, the full-year analysis, and the totals, closing on the
book. The final cut (3 minutes 14 seconds) carries the narration as a
recorded voice track, placed line by line at the moment each scene
appears, with the same words as on-screen captions; the narration script
is `demo/narration-script.md`. The voice was recorded and the cut
assembled in a separate finishing pass (`demo/capture-voiced.mjs`,
`demo/stills.mjs`) because the build environment has no speech
synthesis.
One honest note about the city scene: during the recording, a live fetch
of Phoenix weather was attempted first, and the recording browser could
not reach the public internet at all (even a direct navigation to a
public site fails in this build environment; the endpoints themselves
were verified separately with browser-accurate requests). The shipped
cut therefore shows the same analysis machinery on the bundled
Lewisville year, and says so on screen. The capture tool,
`demo/capture.mjs`, re-shoots the Phoenix scene automatically on any
machine whose browser can reach the archive.

## Claims check, full table

| ID | Book claim | Simulated result | Verdict |
|---|---|---|---|
| C-01 | 1 m² lens, DNI 1,000, C=60, η 0.75 gives 750 W and 45,000 W/m² | 750 W and 45,000 W/m² by the model's optical chain | AGREE |
| C-02 | Rankine 36.2% ideal, 27.1% realistic, 19.8% pessimistic | 36.7%, 27.5%, 20.0% (tolerance 1 point) | AGREE |
| C-03 | Design day 220 kWh to 27.6 kWh net (92% of demand) | Cold start 12.1 kWh; continuous day three 24.2 kWh (87.7%) | PARTIAL |
| C-04 | Sizing: 40 m² aperture, 0.67 m² receiver, 51 m² condenser | Parameter audit and sizing equation give 40, 0.667, 50.6 | AGREE |
| C-05 | Tesla valve Di about 2 in the plateau | Di(Re 800) = 2.00; reversed run costs 8.3% of net | AGREE |
| C-06 | Phase-directed routing at 95%+ selectivity | Not simulated; the book labels it a hypothesis | UNTESTABLE |
| C-07 | Sealed loop loses no water | 0.000000 kg on every run, under the sealed-boundary assumption | AGREE (within model assumptions) |
| C-08 | Condenser A = Q/(U ΔT): 31 m² and 51 m² cases | 31.25 m² and 50.6 m² | AGREE |
| C-09 | No photovoltaics, no battery night cycle | Architecture audit clean | AGREE |
| C-10 | Skips about 5% grid transmission loss | Outside version one | UNTESTABLE |
| C-11 | Focal spots and temperatures are demonstrated territory | Literature claims, not simulated | UNTESTABLE |
| C-12 | Check valves are the routing fallback | Design record, not a simulation claim | UNTESTABLE |

Tally: AGREE 6, AGREE within stated assumptions 1, PARTIAL 1,
UNTESTABLE 4.

The one disagreement that matters is C-03, and it is a modeling finding,
not a fudge: the book's design-day balance is steady-state arithmetic.
It does not charge the morning it takes to bring 180 kg of water and a
steel vessel from ambient to 4 MPa and 400 °C. The dynamic model charges
it. Run the same design day back to back and by day three the plant is
living at the design point, and the model returns 87.7% of the book
figure. The remaining gap is traced to the condenser: the book holds it
at 40 °C, the model lets a Texas afternoon push it toward 55 °C, and the
book's own penalty rule (about 2 points per 10 K) prices that difference.

## Parity numbers

- Scenarios (summer-clear, winter-clear, night-only, zero-control,
  book-design-day, reversed valve): all three implementations produce
  identical four-decimal summaries and the identical FNV digest per
  scenario. Worst field spread: 0.0000%.
- Design day over three days: day-three net 24.20 kWh, spread across
  implementations 0.0001 kWh.
- Annual Lewisville 2024 (8,784 hours): net 9,286.12 kWh in all three;
  worst field spread 0.0021% (condenser total).
- Determinism: every implementation reproduces its digest byte-for-byte
  on repeat runs.

## Energy balance and water

- Closure tolerance: 2% of solar input or 1 kWh, whichever is larger.
  Scenario residuals: 0.00 to 0.96 kWh. Annual residual 496 kWh, 0.58%
  of solar input.
- Water: start 250.000 kg, end 250.000 kg, delta 0.000000 kg, on every
  scenario and on the full year. This is the inventory ledger agreeing
  with its sealed boundary (assumption A-22). It is consistency, not
  proof that a physical loop cannot leak.

## Lewisville 2024, the bundled year in numbers

Net 9,286 kWh, gross 9,427 kWh, peak net 4.89 kW, capacity factor 15.1%
(7 kW nameplate). Monthly net kWh: Jan 661, Feb 649, Mar 738, Apr 628,
May 691, Jun 914, Jul 915, Aug 1,000, Sep 817, Oct 985, Nov 679, Dec 610.
Best day 40.96 kWh, median day 30.40 kWh, worst day 0, sixteen days with
no output. Winter needs a priming day from a cold start: the first clear
winter day charges the boiler without generating, and the days after it
generate about 13 kWh each.

## Documented limits

1. Lumped-parameter fidelity: no spatial resolution inside any component,
   no CFD, no transient two-phase flow. Slug-flow diodicity inversion
   (the book's Di = 0.78 citation) is outside the valve correlation.
2. Steam properties are simplified correlations, not full IAPWS IF97.
   They reproduce the book's cycle table within half a point and
   saturation pressure within about 2% at 250 °C; they are not for
   design work.
3. The boiler is one lumped two-phase vessel with a volume-sized steam
   space (A-29) and a design-point pressure rule (A-28). A real vessel's
   pressure responds to its actual volume, level, and relief settings.
4. The turbine admits steam only near the design point (A-30). Part-load
   and startup-roll behavior of a real small turbine are not modeled, and
   neither is the book's warning band of 40 to 60% efficiency for small
   expanders: the model uses the book's reference 75% turbine efficiency,
   which is a choice the book's own sensitivity table brackets with its
   55% pessimistic case.
5. Only the home tier is simulated. The corporate and apartment tiers are
   defined in the book and are context here, not simulated plants.
6. Weather years are fetched as complete calendar years, the one or two
   most recent complete ones. Day grouping is by UTC date (A-26).
7. Soiling, dust, degradation, freezing, and wind are named in the book
   and excluded here (A-23). Snow and storm damage are not modeled.
8. The water result is an accounting identity under a sealed boundary
   with all loss streams set to zero (A-22); the book's own inventory
   method, makeup trending to zero, is the field test, and it needs a
   built loop.
9. The page's three-dimensional dimensions are scaled from the book's
   areas and duties; individual casing dimensions are display defaults
   (A-25), labeled as such in the part readouts. This is not a
   fabrication drawing set.
10. The demo video's closing scenes (city picker, full-year analysis,
    claims table, the book) are real page screenshots presented with a
    slow zoom and burned-in captions, not screencast footage: the
    recording browser's screencast stalls once the analysis view is on
    screen, which main-side verification reproduced in both the original
    and the voiced capture before switching methods. Nothing in the
    closing scenes is mocked up; every frame is the deployed page.
11. The demo video's city segment shows the bundled city rather than a
    live-fetched one, because the recording browser had no route to the
    public internet. The page's live fetch is unaffected; it was verified
    at the endpoint level and works wherever the browser itself can reach
    the archive, including the deployed page.
