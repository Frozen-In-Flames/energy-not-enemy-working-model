#!/usr/bin/env python3
"""Oracle CLI: mirrors the C++ ene-model commands and JSON shape."""
import csv
import json
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from model import (PARAMS, fnv1a64, rankine_cycle, sat_pressure_mpa,
                   sat_temp_c, scenario_weather, simulate, summary_string,
                   valve_diodicity)


def summary_json(r, name, load, rev):
    dig = fnv1a64(summary_string(r, name, load, rev))
    return json.dumps({
        "scenario": name, "load_kw": round(load, 3), "reversed": bool(rev),
        "hours": r["hours"], "solar_kwh": round(r["total_solar_kwh"], 4),
        "heat_kwh": round(r["total_heat_kwh"], 4),
        "gross_kwh": round(r["total_gross_kwh"], 4),
        "net_kwh": round(r["total_net_kwh"], 4),
        "condenser_kwh": round(r["total_condenser_kwh"], 4),
        "peak_net_kw": round(r["peak_net_kw"], 4),
        "water_start_kg": round(r["water_start_kg"], 4),
        "water_end_kg": round(r["water_end_kg"], 4),
        "water_delta_kg": round(r["water_delta_kg"], 6),
        "balance_residual_kwh": round(r["balance_residual_kwh"], 4),
        "digest": dig})


def main(argv):
    if len(argv) < 2:
        print("usage: run.py <cycle|scenario|steps|csv|sat>", file=sys.stderr)
        return 2
    cmd = argv[1]
    p = dict(PARAMS)
    if cmd == "cycle":
        ideal = rankine_cycle(4.0, 400.0, 40.0, 1.0, 1.0)
        real = rankine_cycle(4.0, 400.0, 40.0, 0.75, 0.65)
        pess = rankine_cycle(4.0, 400.0, 40.0, 0.55, 0.50)
        print(json.dumps({
            "ideal_eff": round(ideal["efficiency"], 4),
            "realistic_eff": round(real["efficiency"], 4),
            "pessimistic_eff": round(pess["efficiency"], 4),
            "h3": round(real["h3"], 2), "h4s": round(real["h4s"], 2),
            "sat_t_at_1atm_c": round(sat_temp_c(0.101325), 3),
            "sat_p_at_250c_mpa": round(sat_pressure_mpa(250.0), 4),
            "di_at_re800": round(valve_diodicity(800.0), 3)}))
        return 0
    if cmd == "sat":
        t = float(argv[2])
        print(json.dumps({"t_c": t, "p_mpa": round(sat_pressure_mpa(t), 5),
                          "tsat_of_p_c": round(sat_temp_c(sat_pressure_mpa(t)), 3)}))
        return 0
    if cmd in ("scenario", "steps"):
        name = argv[2]
        rev = False
        load = 5.0
        out = None
        days = 1
        i = 3
        while i < len(argv):
            if argv[i] == "--reversed":
                rev = True
            elif argv[i] == "--load":
                i += 1
                load = float(argv[i])
            elif argv[i] == "--out":
                i += 1
                out = argv[i]
            elif argv[i] == "--days":
                i += 1
                days = int(argv[i])
            i += 1
        if name == "reversed-valve":
            name = "summer-clear"
            rev = True
        w1 = scenario_weather(name, p)
        w = w1 * days
        r = simulate(p, w, 0.05, load, rev, collect_steps=(cmd == "steps"))
        if cmd == "steps" and out:
            write_steps(r, out)
        print(summary_json(r, name, load, rev))
        return 0
    if cmd == "csv":
        path = argv[2]
        load = 5.0
        dt = 0.25
        out = None
        i = 3
        while i < len(argv):
            if argv[i] == "--load":
                i += 1
                load = float(argv[i])
            elif argv[i] == "--dt":
                i += 1
                dt = float(argv[i])
            elif argv[i] == "--out":
                i += 1
                out = argv[i]
            i += 1
        w = []
        with open(path) as f:
            rd = csv.reader(f)
            next(rd)
            for row in rd:
                if row:
                    w.append((float(row[1]), float(row[2])))
        r = simulate(p, w, dt, load, False, collect_steps=bool(out))
        if out:
            write_steps(r, out)
        print(summary_json(r, "csv:" + path, load, False))
        return 0
    print("unknown command", file=sys.stderr)
    return 2


def write_steps(r, path):
    cols = ["t_h", "dni_w_m2", "ambient_c", "p_solar_kw", "p_heat_kw",
            "boiler_temp_c", "boiler_pressure_mpa", "steam_kg",
            "turbine_flow_kg_h", "p_shaft_kw", "rpm", "p_gross_kw", "p_net_kw",
            "condenser_temp_c", "p_condenser_kw", "boiler_kg", "exhaust_kg",
            "condenser_kg", "cum_net_kwh", "balance_residual_kwh"]
    with open(path, "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["t_h", "dni", "ambient", "solar_kw", "heat_kw", "boiler_c",
                     "pressure_mpa", "steam_kg", "turbine_kg_h", "shaft_kw",
                     "rpm", "gross_kw", "net_kw", "condenser_c", "condenser_kw",
                     "boiler_kg", "exhaust_kg", "condenser_kg", "cum_net_kwh",
                     "balance_residual_kwh"])
        for s in r["steps"]:
            wr.writerow([s[c] for c in cols])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
