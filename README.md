# Energy Not Enemy: The Working Model

A working simulation of the solar steam generator described in *Energy Not
Enemy* by Aries Hilton. The book argues; this model demonstrates. Sunlight
is gathered by a parabolic-profile Fresnel lens, water becomes steam in a
closed loop, the steam turns a turbine and a generator, and at night the
steam condenses and the water comes home. There are no solar panels in this
machine, and none in this simulation.

The web page shows the plant in three dimensions, part by part, with the
energy measured at every phase while it runs. The city is a user input: the
page fetches real hourly sunlight and temperature for the place you choose
and runs the same machine on that weather.

## The source document

The design's source document is the book itself. The full text of *Energy
Not Enemy* is in [`book/`](book/), free to read there by the author's
choice. The author's strategy is dual-path: free for those who find it in
this repository, paid for those who buy it through storefronts.

The book is Copyright Aries Hilton, all rights reserved. It is **not**
covered by this repository's software license and is not licensed for
resale or redistribution. The software license (Apache License 2.0, see
[`LICENSE.md`](LICENSE.md)) applies to the simulation code only. See
[`book/README.md`](book/README.md).

Every quantitative parameter the book states is traced in
[`SPEC.md`](SPEC.md), 68 entries with chapter and page. Every value the
simulation needs that the book does not state is in the same file's
assumption register, 30 entries, each marked ASSUMPTION with the default
chosen and why.

## Fidelity statement

This is a lumped-parameter model. Real equations, solved live: solar
position, concentration, a two-phase boiler on the saturation curve, steam
properties from hand-coded correlations, a direction-dependent Tesla valve,
a turbine on the enthalpy drop, a dynamic condenser, and a water inventory
ledger. It is not a mesh CFD or finite-element model, it resolves no
component in space, and it is not a measurement of a built machine. Where
the simulation and the book disagree, the disagreement is published in the
claims table below and in `results/claims-check.json`, never smoothed
over.

## What the checks found

The model was built three times: a C++ solver core, an independent Python
oracle (standard library only), and a JavaScript port for the page. A
battery of 38 checks passes, including:

| Check | Result |
|---|---|
| Cross-implementation parity, reference scenarios | identical summary digests; worst field spread 0.0000% |
| Cross-implementation parity, full Lewisville year | worst field spread 0.0021% |
| Energy balance closure, scenarios | residuals 0.00 to 0.96 kWh against tolerances of 2% of solar input |
| Energy balance closure, full year | 496 kWh on 85,038 kWh of sunlight (0.58%) |
| Zero-irradiance negative controls | zero electrical output, all day, all implementations |
| Reversed-valve control | reversing the valve costs 8.3% of net output |
| Steam sanity | saturation temperature at 1 atm is 100.000 °C |
| Solar sanity | solstice noon elevation matches the hand-computed reference within 0.02° |
| Water inventory | 0.000000 kg gained or lost on every scenario and the full year |

Headline results, all reproducible with the battery:

- Book cycle table (36.2% ideal, 27.1% realistic, 19.8% pessimistic):
  the model's correlations give 36.7%, 27.5%, 20.0%. Agreement within
  half a percentage point.
- Book design day (27.6 kWh net, steady-state arithmetic): the dynamic
  model gives 12.1 kWh from a cold start and 24.2 kWh on the third
  consecutive day of the same weather, 87.7% of the book figure. The gap
  is the warm-up the book's arithmetic does not charge, plus a condenser
  that runs hotter than the book's fixed 40 °C on a Texas afternoon.
  Verdict: PARTIAL, named in the claims table.
- Lewisville, Texas, full year 2024 on real weather: 9,286 kWh net,
  capacity factor 15.1% on a 7 kW nameplate, peak 4.89 kW, best day
  40.96 kWh, median day 30.40 kWh, 16 days with no output.

Claims tally: 12 book claims checked. AGREE 6, AGREE within the model's
stated assumptions 1 (the zero water loss, which the model can only test
as accounting inside a sealed boundary), PARTIAL 1 (the design day),
UNTESTABLE in a lumped model 4 (led by the phase-routing hypothesis the
book itself labels an experiment).

## Run it

**The page.** Serve `docs/` over HTTP (GitHub Pages does this) and open
`docs/index.html`. It works fully offline once a city's data has been
loaded or cached. No build step, no libraries: the page is hand-written
HTML, JavaScript, and WebGL.

**The C++ solver core.**
```
g++ -std=c++17 -O2 -o build/ene-model src/model.cpp src/main.cpp
build/ene-model cycle
build/ene-model scenario book-design-day --days 3
build/ene-model csv data/lewisville-tx-2024-open-meteo.csv
```

**The Python oracle.**
```
python3 oracle/run.py cycle
python3 oracle/run.py scenario summer-clear
```

**Everything at once.**
```
sh tools/verify.sh
```

## Solver route

The page was to run the C++ solver compiled to WebAssembly if a toolchain
existed on the build machine. Checked 2026-10-24: `g++` is present;
`clang++`, `em++`, and `wasm-ld` are not. The page therefore runs a
hand-written JavaScript port of the same model, and the port is held to
the C++ core and the Python oracle by the parity battery: same scenarios,
same weather, stated tolerances, identical summary digests. No silent
divergence.

## Data

Weather is measured data, fetched live or bundled, never synthesized.
The bundled extract is Lewisville, Texas, 2024, hourly, from the
Open-Meteo Archive: 8,784 rows, with full provenance in
[`data/PROVENANCE.md`](data/PROVENANCE.md). Live cities use the same
archive as the primary source and NASA POWER hourly as the documented
fallback; both endpoints were verified to answer direct browser requests.
Fetched datasets and computed results are cached in the browser's
IndexedDB, so a fetched city works offline afterward.

## Layout

- `book/`: the book (PDF, EPUB, cover), free to read, all rights reserved
- `SPEC.md`: component list, system flow, 68 book parameters, claims
  checklist, 30-entry assumption register
- `src/`: the C++ solver core and CLI
- `oracle/`: the independent Python oracle (standard library only)
- `docs/`: the web page (hand-written JavaScript and WebGL, no libraries)
- `data/`: bundled weather extract and provenance
- `tests/`: the verification battery and the JS test shim
- `tools/`: data fetch and verification scripts
- `results/`: battery output, claims check, annual statistics
- `demo/`: the narrated walkthrough video, its script, and the capture
  tooling
- `RELEASE-NOTES-v1.0.0.md`: what shipped, why, and every documented limit
