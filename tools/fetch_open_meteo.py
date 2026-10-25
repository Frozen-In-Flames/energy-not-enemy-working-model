#!/usr/bin/env python3
"""Regenerate the bundled Lewisville dataset from the Open-Meteo Archive.

Python standard library only. Writes the CSV and its metadata JSON into
data/ and refreshes the served copies in docs/data/. The full provenance of
the shipped extract is recorded in data/PROVENANCE.md.
"""
import csv
import json
import os
import statistics
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAT, LON = 33.046, -96.994
YEAR = 2024
ENDPOINT = "https://archive-api.open-meteo.com/v1/archive"


def main():
    url = (ENDPOINT + "?latitude=%s&longitude=%s&start_date=%d-01-01"
           "&end_date=%d-12-31&hourly=direct_normal_irradiance,"
           "temperature_2m&timezone=GMT" % (LAT, LON, YEAR, YEAR))
    with urllib.request.urlopen(url) as r:
        d = json.load(r)
    times = d["hourly"]["time"]
    dni = d["hourly"]["direct_normal_irradiance"]
    tmp = d["hourly"]["temperature_2m"]
    rows = list(zip(times, dni, tmp))
    assert all(v is not None for _, v, _ in rows), "null DNI present"
    assert all(v is not None for _, _, v in rows), "null temperature present"
    name = "lewisville-tx-%d-open-meteo" % YEAR
    csv_path = os.path.join(ROOT, "data", name + ".csv")
    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp_utc", "direct_normal_irradiance_w_m2",
                    "ambient_temperature_c"])
        for t, a, b in rows:
            w.writerow([t, "%.2f" % a, "%.2f" % b])
    meta = {
        "dataset_id": name + "-v1",
        "place": "Lewisville, Texas, United States",
        "requested_latitude": LAT,
        "requested_longitude": LON,
        "returned_latitude": d["latitude"],
        "returned_longitude": d["longitude"],
        "returned_elevation_m": d.get("elevation"),
        "source": "Open-Meteo Archive API (ERA5-based historical weather data)",
        "endpoint": ENDPOINT,
        "period": "%s to %s" % (rows[0][0] + "Z", rows[-1][0] + "Z"),
        "timezone": "GMT (UTC timestamps)",
        "variables": ["direct_normal_irradiance (W/m²)",
                      "temperature_2m (°C)"],
        "hours": len(rows),
        "annual_direct_normal_irradiation_kwh_m2":
            round(sum(a for _, a, _ in rows) / 1000, 3),
        "mean_ambient_temperature_c":
            round(statistics.mean(b for _, _, b in rows), 3),
        "fetched": "2026-10-24",
        "license_note": "Bundled as measured input data with this provenance. "
                        "The simulation code license does not change the "
                        "data provider terms.",
    }
    meta_path = os.path.join(ROOT, "data", name + ".meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    docs_data = os.path.join(ROOT, "docs", "data")
    os.makedirs(docs_data, exist_ok=True)
    for src in (csv_path, meta_path):
        with open(src, "rb") as a, open(os.path.join(
                docs_data, os.path.basename(src)), "wb") as b:
            b.write(a.read())
    print("wrote", csv_path, len(rows), "rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
