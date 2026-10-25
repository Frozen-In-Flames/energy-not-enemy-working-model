# Weather Data Provenance

The Working Model runs on real measured weather. This file records exactly
where every bundled dataset came from. Live-fetched datasets record the same
fields in the page, next to the city's results, and in the cached copy on the
user's device.

## Bundled dataset: Lewisville, Texas, 2024

| Field | Value |
|---|---|
| File | `data/lewisville-tx-2024-open-meteo.csv` (served copy: `docs/data/`) |
| Place | Lewisville, Texas, United States |
| Requested coordinates | 33.046, -96.994 |
| Returned grid point | 33.07557, -96.96561, elevation 183.5 m |
| Source | Open-Meteo Archive API (ERA5-based historical weather) |
| Endpoint | `https://archive-api.open-meteo.com/v1/archive` |
| Query | `latitude=33.046&longitude=-96.994&start_date=2024-01-01&end_date=2024-12-31&hourly=direct_normal_irradiance,temperature_2m&timezone=GMT` |
| Period | 2024-01-01T00:00Z to 2024-12-31T23:00Z (8,784 hourly rows) |
| Variables | `direct_normal_irradiance` (W/m²), `temperature_2m` (°C) |
| Missing values | 0 of 8,784 for both variables |
| Annual direct normal irradiation | 2,190.218 kWh/m² |
| Mean ambient temperature | 20.117 °C |
| Maximum DNI | 965.5 W/m² |
| Fetched | 2026-10-24 |

The CSV timestamps are UTC. The machine-readable metadata shipped beside the
CSV is `lewisville-tx-2024-open-meteo.meta.json`.

## Live data sources, verified from the browser's position

Both endpoints were tested on 2026-10-24 with an `Origin` header, exactly as
a browser sends, and both answered with `Access-Control-Allow-Origin: *`:

1. **Primary: Open-Meteo Archive API.** Simple JSON arrays, hourly,
   multi-year, ERA5-based. Variables used: `direct_normal_irradiance`,
   `temperature_2m`. Time standard requested: `timezone=GMT` (UTC).
2. **Fallback: NASA POWER hourly API.** Endpoint
   `https://power.larc.nasa.gov/api/temporal/hourly/point` with
   `parameters=ALLSKY_SFC_SW_DNI,T2M`. The NASA documentation states the
   hourly API defaults to Local Solar Time, so the page's adapter always
   passes `time-standard=UTC` explicitly. The adapter is in
   `docs/weather.js` and engages only if the primary source fails.

City name search uses the Open-Meteo Geocoding API
(`https://geocoding-api.open-meteo.com/v1/search`), verified the same way.
Coordinates can always be entered directly, and presets cover Lewisville
(default), Phoenix (desert), Seattle (northern, cloudy), Miami (coastal),
and Singapore (equatorial).

## What the app requests for a live city

- Full calendar years: the one or two most recent complete years (the page's
  time-span control chooses), fetched one year per request so progress can be
  reported honestly.
- Provenance is displayed in the page next to each city's results: source,
  endpoint, grid latitude and longitude, period, variables, and fetch date.
- Datasets and computed results are cached in the browser's IndexedDB.
  A city, once fetched, works fully offline.

## What is not in the model

Wind is not fetched: the lumped model has no wind term (SPEC.md A-23).
Humidity and pressure are not fetched: the condenser and boiler models do not
use them. Nothing in the bundled or fetched data was altered, interpolated,
or synthesized; null handling in the live adapters is limited to carrying
the last temperature forward and treating a missing DNI as zero, and is
documented in `docs/weather.js`.
