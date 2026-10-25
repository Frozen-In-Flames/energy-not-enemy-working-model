# Energy Not Enemy: The Working Model, Specification

## 1. Purpose and source

This specification was mined from Aries Hilton's *Energy Not Enemy* before any
simulation code was written. The controlling manuscript sources are the
31 chapter files in `~/workspace/book-energy/manuscript/`, checked against the
319-page PDF (ReportLab PDF, 319 pages, author Aries Hilton). Printed book page
numbers below are the page numbers printed in the book and visible in its table
of contents.

The model is a lumped-parameter simulation. It is not a mesh CFD model, not a
finite-element model, and not operating evidence. Its job is narrower and
explicit: run the book's stated machine, with the book's stated numbers where
they exist, real measured weather inputs where they exist, and named defaults
where the book leaves a value open.

## 2. The system the book specifies

### 2.1 Daily flow

1. **Dawn:** the sealed loop is charged with liquid water recovered during the
   previous night. Tracking mirrors and the Fresnel lens find the sun.
2. **Collection:** a flat, refractive, parabolic-profile Fresnel lens, with a
   heliostat-style mirror boost stage, concentrates direct sunlight onto a
   receiver. This is a lens, not a parabolic mirror or dish.
3. **Boiler:** concentrated heat enters the closed-loop receiver-boiler,
   raises liquid water to saturation, flashes part of it to steam, and then
   superheats the steam.
4. **Power leg:** steam passes through the power-leg Tesla-valve section,
   expands through a steam turbine, and turns a generator.
5. **Condenser:** exhaust steam gives up latent heat in a condenser. The
   book's condenser theorem is that the air side sizes a passive condenser.
6. **Return leg:** condensate returns through the return-leg Tesla-valve
   section and the feed pump to boiler pressure.
7. **Night:** remaining vapor condenses, liquid returns, and the operator's
   inventory ledger tests the book's no-leaking claim:
   `Inventory_evening = Inventory_morning + Makeup − Blowdown − Samples − Fugitives`.
8. **No photovoltaics** appear anywhere in the specified system. No battery is
   part of the specified day/night cycle.

### 2.2 Components carried into the three-dimensional model

From Chapter 7 (printed p. 52), reduced to the manufactured parts the page
must show individually:

| Part | Book function |
|---|---|
| Parabolic-profile Fresnel lens array | Concentrates sunlight to the receiver |
| Heliostat boost mirrors and trackers | Redirect additional sunlight onto the aperture and follow the sun |
| Receiver cavity and selective absorber | Converts concentrated flux to heat in the working fluid |
| Boiler pressure vessel | Contains pressurized water and steam |
| Tesla valve, power leg | Biases steam flow in the forward direction |
| Steam turbine or expander | Converts steam enthalpy drop to shaft work |
| Generator | Converts shaft work to electricity |
| Shaft and coupling | Transmits turbine work to the generator |
| Condenser panels | Reject latent heat and return steam to liquid |
| Tesla valve, return leg | Biases condensate return in the night direction |
| Feed pump | Returns condensate against boiler pressure |
| Connecting loop piping, relief and isolation hardware | Closes and protects the loop |
| Fill, sampling and blowdown station | Supports the water inventory ledger |

Chapter 7's procurement doctrine matters to the model's claims: buy proven
components, build only the integration. The two valve sections and the control
logic are the integration's custom lines; the receiver-boiler assembly is
built or certified. The book claims the **integration**, not component
invention.

## 3. Book-stated parameter register

`BOOK` means the value is stated in the book as a design value, a sourced
range, a worked example, or a calculated reference result. It does not mean
the value was measured on a built Energy Not Enemy unit. The book itself is
careful about that distinction and this model preserves it.

| ID | Parameter | Book value | Source |
|---:|---|---:|---|
| B-01 | Reference home electricity demand | 30 kWh/day | Ch. 1, printed p. 10; Ch. 8, p. 60 |
| B-02 | Reference home peak demand | 5 kW | Ch. 1, p. 10; Ch. 8, p. 60 |
| B-03 | Average United States home use used for context | 10,800 kWh/year | Ch. 1, p. 10 |
| B-04 | Standard peak direct sunlight used in worked optics | 1,000 W/m² DNI | Ch. 2, p. 16 |
| B-05 | Extraterrestrial solar constant stated in the book | 1,361 W/m² | Ch. 2, p. 16 |
| B-06 | Fresnel optical-efficiency literature band | 0.75 to 0.89 | Ch. 2, p. 16 |
| B-07 | Reference optical efficiency | 0.75 | Ch. 2, p. 16; Ch. 11, p. 79 |
| B-08 | Home concentration-ratio band | 40 to 80 | Ch. 2, p. 16 |
| B-09 | Reference geometric concentration ratio | 60 | Ch. 2, p. 16; Ch. 8, p. 60 |
| B-10 | Receiver area for a 1 m² aperture at C = 60 | 1/60 m² | Ch. 2, p. 16 |
| B-11 | Receiver flux in the 1 m² worked example | 45,000 W/m² | Ch. 2, p. 16 |
| B-12 | Point-focus concentration ceiling | about 46,000 | Ch. 2, p. 16 |
| B-13 | Line-focus concentration ceiling | about 212 | Ch. 2, p. 16 |
| B-14 | Home tracking accuracy needed at C ≈ 60 | about 1 to 2 degrees | Ch. 2, p. 16 |
| B-15 | Steam temperature territory for the home design | roughly 200 to 400 °C | Ch. 2, p. 16; Ch. 3, p. 23 |
| B-16 | Reference boiler pressure | 4 MPa | Ch. 3, p. 23; Ch. 6, p. 45 |
| B-17 | Reference superheat temperature | 400 °C | Ch. 3, p. 23; Ch. 6, p. 45 |
| B-18 | Reference condenser temperature in cycle table | 40 °C | Ch. 3, p. 23 |
| B-19 | Ideal Rankine efficiency at B-16 to B-18 | 36.2% | Ch. 3, p. 23 |
| B-20 | Carnot ceiling for the ideal case | 53.5% | Ch. 3, p. 23 |
| B-21 | Realistic-case turbine efficiency | 75% | Ch. 3, p. 23 |
| B-22 | Realistic-case pump efficiency | 65% | Ch. 3, p. 23 |
| B-23 | Realistic small-scale Rankine efficiency | 27.1% | Ch. 3, p. 23 |
| B-24 | Pessimistic-case turbine efficiency | 55% | Ch. 3, p. 23 |
| B-25 | Pessimistic-case pump efficiency | 50% | Ch. 3, p. 23 |
| B-26 | Pessimistic Rankine efficiency | 19.8% | Ch. 3, p. 23 |
| B-27 | Expected micro-expander band named as a warning | 40% to 60% isentropic | Ch. 3, p. 23; Ch. 7, p. 52 |
| B-28 | Condenser-temperature penalty rule | about 2 efficiency points per 10 K | Ch. 3, p. 23 |
| B-29 | Latent heat of water at 1 atm | 2,257 kJ/kg | Ch. 5, p. 37 |
| B-30 | Film-condensation coefficient magnitude | 2,000 to 15,000 W/m²·K | Ch. 5, p. 37 |
| B-31 | Forced-air overall condenser coefficient band | 700 to 850 W/m²·K | Ch. 5, p. 37 |
| B-32 | Passive condenser coefficient band | 5 to 20 W/m²·K | Ch. 5, p. 37 |
| B-33 | Reference passive condenser coefficient | 8 W/m²·K | Ch. 5, p. 37; Ch. 8, p. 60 |
| B-34 | Chapter 5 illustrative nightly heat duty | 50 kWh over 10 h | Ch. 5, p. 37 |
| B-35 | Chapter 5 log-mean temperature difference | 20 K | Ch. 5, p. 37 |
| B-36 | Chapter 5 passive condenser area | about 31 m² | Ch. 5, p. 37 |
| B-37 | Robust macro-scale Tesla-valve diodicity | about 2 | Ch. 4, p. 30 |
| B-38 | Honest reported diodicity range | about 1.2 to 4 | Ch. 4, p. 30 |
| B-39 | Tesla-valve turn-on Reynolds number | about 200 | Ch. 4, p. 30 |
| B-40 | Diodicity at 2, 6, and 10 stages in one cited study | 1.43, 2.76, 3.58 at Re = 450 | Ch. 4, p. 30 |
| B-41 | Slug-flow inversion warning | Di = 0.78 in one cited CFD result | Ch. 4, p. 30 |
| B-42 | Design-day beam resource in home sizing | 5.5 kWh/m²/day | Ch. 8, p. 60 |
| B-43 | Home optical-plus-receiver system efficiency | 0.50 | Ch. 8, p. 60 |
| B-44 | Receiver efficiency used by the reference sizing | about 0.67 | Ch. 8, p. 60; Ch. 11, p. 79 |
| B-45 | Daily heat required by the reference home cycle | about 111 kWh thermal/day | Ch. 8, p. 60 |
| B-46 | Reference lens aperture | about 40 m² (40.4 m² in sensitivity table) | Ch. 8, p. 60 |
| B-47 | Reference receiver area | about 0.67 m² | Ch. 8, p. 60 |
| B-48 | Reference nightly heat rejection | about 81 kWh over 10 h | Ch. 8, p. 60 |
| B-49 | Reference passive condenser area | about 51 m² | Ch. 8, p. 60 |
| B-50 | Reference turbine and generator class | 5 to 7 kW | Ch. 8, p. 60 |
| B-51 | Reference beam energy on aperture | 220 kWh/day | Ch. 11, p. 79 |
| B-52 | Reference energy after optics | 165 kWh/day | Ch. 11, p. 79 |
| B-53 | Reference heat entering the cycle | 111 kWh/day | Ch. 11, p. 79 |
| B-54 | Reference shaft energy | 30 kWh/day | Ch. 11, p. 79 |
| B-55 | Generator efficiency | 0.95 | Ch. 11, p. 79 |
| B-56 | Reference gross electrical energy | 28.5 kWh/day | Ch. 11, p. 79 |
| B-57 | Feed-pump parasitic in reference balance | 0.25 kWh/day | Ch. 11, p. 79 |
| B-58 | Tracking parasitic in reference balance | 0.15 kWh/day | Ch. 11, p. 79 |
| B-59 | Controls and instrumentation parasitic | 0.50 kWh/day | Ch. 11, p. 79 |
| B-60 | Optional condenser-fan parasitic | 2.0 kWh/day | Ch. 11, p. 79 |
| B-61 | Reference net electrical output, passive condenser | 27.6 kWh/day | Ch. 11, p. 79 |
| B-62 | Reference net electrical output, forced condenser | 25.6 kWh/day | Ch. 11, p. 79 |
| B-63 | Reference demand coverage | about 92% passive, 85% forced | Ch. 11, p. 79 |
| B-64 | Reference useful rejected heat | about 81 kWh/day | Ch. 11, p. 79 |
| B-65 | Phase-selectivity target in the Chapter 15 test ledger | at least 95% | Ch. 15, p. 106 |
| B-66 | Home lens module size in the bill of materials | about 1 to 2 m² per lens | Ch. 7, p. 52 |
| B-67 | Boiler vessel design-pressure rule | at least 1.5 times operating pressure | Ch. 7, p. 52 |
| B-68 | United States transmission and distribution loss context | about 5% | Ch. 1, p. 10 |

**Count:** 68 book-sourced parameter or reference-result entries.

### 3.1 Scaling-unit definition

The book's scaling unit is the **building**. Its three deployment tiers are
the home, the corporate building, and the apartment complex. Version one of
this simulation implements the fully worked **home tier** only. Corporate and
apartment figures in Chapter 1 and Chapter 9 are context for the unit
definition, not silently converted into a second and third simulated plant.
That limitation is stated in the release notes.

## 4. Book quantitative claims checklist

| ID | Claim, stated as the book states it | How version one checks it |
|---:|---|---|
| C-01 | A 1 m² lens at DNI 1,000 W/m², C = 60, and optical efficiency 0.75 delivers 750 W to a receiver of 1/60 m², or 45,000 W/m². | Direct optical calculation in all three solver implementations. |
| C-02 | At 4 MPa and 400 °C with a 40 °C condenser, Rankine efficiency is 36.2% ideal, 27.1% with 75% turbine and 65% pump efficiency, and 19.8% with 55% turbine and 50% pump efficiency. | Hand-coded steam-property correlations and the book's Fixed State-Point Procedure. |
| C-03 | The reference home design day carries 220 kWh on the aperture to 27.6 kWh net electricity with a passive condenser, about 92% of a 30 kWh/day demand. | A synthetic design-day weather profile holding the book's 5.5 kWh/m²/day beam total, run through the dynamic solver. Dynamic storage and control differences are reported, not hidden. |
| C-04 | The reference home needs about 40 m² aperture, 0.67 m² receiver, and about 51 m² passive condenser for the stated sizing chain. | Parameter audit plus the condenser sizing equation using 81 kWh, 10 h, U = 8, and ΔT = 20 K. |
| C-05 | A Tesla valve has a robust macro-scale diodicity of about 2 in its plateau regime. | The valve correlation is evaluated at Re = 800 and in forward/reverse control runs. |
| C-06 | Tesla-valve phase-directed day/night cycling will route steam forward by day and liquid back by night. | The book calls this a hypothesis. The lumped model can display the intended state and test directional resistance; it cannot prove two-phase routing. Verdict class: untestable in this model. |
| C-07 | The sealed loop loses no water; makeup trends to zero. | The solver tracks total inventory exactly under a sealed boundary with makeup, blowdown, samples, and fugitives all set to zero. This tests accounting consistency only. It is not physical proof. |
| C-08 | Passive condenser sizing follows A = Q / (U ΔT), giving about 31 m² for 50 kWh over 10 h at U = 8 and ΔT = 20 K, and about 51 m² for the full reference rejection duty. | Direct sizing calculation. |
| C-09 | The integration contains no photovoltaics and no battery-dependent night cycle. | Architecture and code audit. |
| C-10 | The design skips about 5% transmission and distribution loss for electricity generated and used on site. | Not simulated. Grid delivery and building load coincidence are outside version one. |
| C-11 | Fresnel focal spots and home steam temperatures are in demonstrated territory. | The book's cited demonstrations are literature context. This simulation does not validate external experiments. |
| C-12 | The phase-routing fallback is conventional check valves if Chapter 14's experiment falsifies the hypothesis. | Design fallback recorded. No experiment exists in this software to falsify it. |

## 5. Assumption register

Every entry below is a value or model form the simulation needs and the book
does not fix for the reference unit. `ASSUMPTION` is a label, not an apology:
each one is visible in the page's register and in the release notes.

| ID | Assumption | Default chosen | Why |
|---:|---|---:|---|
| A-01 | Numerical time step | 0.05 h for day runs; 0.25 h for multi-day runs | Small enough for the lumped thermal states while keeping two years of hourly weather fast. |
| A-02 | Total sealed water inventory | 250 kg | The book gives an accounting method, not a charge mass. Large enough to avoid dry-out artifacts in the lumped model. |
| A-03 | Boiler liquid inventory at dawn | 180 kg | Leaves a plausible steam and condensate distribution inside A-02. |
| A-04 | Steam-buffer target inventory | 25 kg | Gives the boiler a finite store so evening pressure decay is visible. |
| A-05 | Receiver and boiler effective heat capacity | 1.15 MJ/K | Combines water and an equivalent steel mass; the book does not state vessel mass. |
| A-06 | Condenser effective heat capacity | 2.50 MJ/K | Represents panels plus held condensate; no book value exists. |
| A-07 | Condenser temperature law | Dynamic approach temperature, 12 K base plus stored-heat effect, bounded 35 to 75 °C | The book gives design points and a penalty rule, not a transient condenser state equation. |
| A-08 | Receiver treatment | Book's lumped receiver efficiency 0.67 at the reference chain; receiver temperature is a diagnostic state | Avoids inventing a coating-specific radiation and convection design the book has not fixed. |
| A-09 | Heliostat boost treatment | Folded into the book's aperture and optical chain; no separate boost multiplier | Chapter 11's balance does not state a separate numerical boost factor. Mirrors are drawn, but they do not create unbooked energy. |
| A-10 | Main flow-pipe inside diameter | 50 mm | Needed for Reynolds number. Chapter 7 requires velocity-based sizing but gives no diameter. |
| A-11 | Tesla-valve stage count shown and modeled | 11 stages | Matches the approximate loop count in the robust macro-scale study cited by Chapter 4. Chapter 7 leaves final count to tests. |
| A-12 | Tesla-valve forward quadratic loss coefficient | 18,000 Pa per (kg/s)² | The book gives diodicity but no forward pressure-loss coefficient for this loop. |
| A-13 | Unvalved bypass conductance | 6% of design turbine flow at design pressure difference | Represents leakage paths the book does not quantify; lets reversed orientation have a measurable cost. |
| A-14 | Valve Reynolds correlation | Di = 1 below Re 100, ramps to 2 by Re 300, stays near 2 through the plateau | Encodes Chapter 4's consensus without claiming the excluded slug-flow inversion. |
| A-15 | Turbine rated speed | 3,000 rpm at 5 kW shaft power, capped at 3,600 rpm | The book gives power class, not rotational speed. |
| A-16 | Generator nameplate for capacity factor | 7 kW | Uses the top of the book's 5 to 7 kW class so capacity factor is not flattered. |
| A-17 | Tracking and controls parasitic draw | 0.027 kW while the plant is active | Splits the book's 0.65 kWh/day tracking plus controls estimate across 24 h; feed-pump work is computed separately. |
| A-18 | Steam-property implementation | Simplified IAPWS-style saturation, enthalpy, and entropy correlations | Full IF97 is a large formulation. Version one uses transparent correlations and reports their error against the book's cycle points. |
| A-19 | Solar-position implementation | Fractional-year solar equations for declination, equation of time, elevation, and azimuth | Standard hand-coded approximation; checked at solar noon. Weather DNI is measured input and is not recomputed from clear-sky theory. |
| A-20 | Weather interpolation | Hourly measured values held constant across each hour | Preserves hourly energy totals exactly instead of inventing sub-hourly weather. |
| A-21 | Initial condition | At period start: liquid at ambient temperature, no steam inventory, no condenser stored heat | A stated cold-start boundary. Multi-day runs carry state forward after the first day. |
| A-22 | Loss streams in the water ledger | Makeup, blowdown, samples, and fugitives all zero | Implements the book's sealed-loop claim as a boundary condition. It does not prove a physical loop cannot leak. |
| A-23 | Soiling, dust, degradation, freezing, and wind | Excluded from version one | The book names these effects but gives no reference-unit coefficients for them. |
| A-24 | Electrical load control | The user slider is a demand cap from 0 to 7 kW, not a household load profile | Keeps cause and effect visible. Unmet demand is not modeled. |
| A-25 | Three-dimensional part dimensions | Scaled from B-46, B-47, B-49, B-66 and A-02 to A-06; individual casing dimensions are display defaults | The book fixes areas and duties for the reference unit, not a fabrication drawing set. Part labels identify default dimensions. |
| A-26 | Day grouping | The dataset's UTC dates | Weather is fetched and stored in UTC; grouping by UTC date keeps the page, the solvers, and the verification battery slicing identical periods. The page labels its dates as UTC. |
| A-27 | Boiler standby heat loss | 0.0015 kW per K of boiler-to-ambient difference | The book specifies insulation but no loss coefficient. This value makes overnight cooling visible without dominating the balance. |
| A-28 | Pressure behavior at the design point | Pressure follows the saturation curve up to the 4 MPa design point; surplus energy then superheats the steam buffer at design pressure | The book fixes the design point and a relief-valve requirement, not a pressure-control law. This is the lumped governor the model uses. |
| A-29 | Boiler vessel volume | 1.6 m³ | The book gives duties and areas, not vessel volume. The volume sizes the steam space so the buffer at the design point is about the A-04 target. |
| A-30 | Turbine admission gate | Stop valve opens at 240 °C and 3.5 MPa or above | The book's cycle is defined at the design point. Admitting steam far below it would drain the boiler through a cycle the book does not specify. |

**Count:** 30 registered assumptions.

## 6. Solver outputs required at every step

The solver state must expose, at minimum:

- UTC time and solar position;
- measured DNI and ambient temperature;
- solar power on the aperture;
- power after optics and receiver loss;
- receiver and boiler temperatures;
- boiler pressure and saturation temperature;
- steam, liquid, exhaust, and total water inventories;
- boiler steam enthalpy flow;
- Tesla-valve Reynolds number, diodicity, pressure drop, forward flow,
  reverse leakage, and flow direction;
- turbine enthalpy drop, shaft power, and rpm;
- gross and net electrical power;
- condenser temperature, heat rejection rate, condensed mass, and stored heat;
- cumulative energy at every phase and cumulative losses;
- stored-energy change and an energy-balance residual;
- total water gain or loss over the selected period.

## 7. Reference scenarios

The parity battery uses these named scenarios:

1. `summer-clear`: one synthetic clear day at Lewisville with a solar-shaped
   DNI profile peaking near 950 W/m².
2. `winter-clear`: one synthetic lower-sun day peaking near 520 W/m².
3. `night-only`: 24 h with zero DNI.
4. `zero-control`: 24 h with zero DNI and a nonzero load cap.
5. `reversed-valve`: the summer-clear weather with the valve orientation
   reversed.
6. `book-design-day`: a solar-shaped synthetic day whose DNI integrates to
   exactly 5.5 kWh/m²/day, used only for the Chapter 11 claims check.

All implementations use the same scenario definitions and the same parameter
values. The C++ program is the solver core. The Python implementation is an
independent stdlib-only oracle. The page implementation is a JavaScript port;
no WebAssembly toolchain was available on the build machine (`g++` exists;
`clang++`, `em++`, and `wasm-ld` do not), so three-way parity is mandatory.
