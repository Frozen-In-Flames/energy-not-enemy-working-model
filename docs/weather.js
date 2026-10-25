/* Energy Not Enemy: The Working Model, weather data and analysis.
 * Hand-written. Data providers are data sources, not code dependencies:
 *   Primary:  Open-Meteo Archive API (ERA5-based), verified 2026-10-24 to
 *             answer direct browser requests (Access-Control-Allow-Origin: *
 *             when an Origin header is sent, as browsers always send).
 *   Fallback: NASA POWER hourly API, requested with time-standard=UTC
 *             (its default is local solar time; the adapter sets UTC).
 * Fetched datasets and computed results are cached in IndexedDB so a city,
 * once fetched, works fully offline. */
(function (global) {
'use strict';

var ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
var GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
var NASA = 'https://power.larc.nasa.gov/api/temporal/hourly/point';

function completeYears(count) {
  // The two most recent complete calendar years relative to today.
  var last = new Date().getUTCFullYear() - 1;
  var years = [];
  for (var i = count - 1; i >= 0; i--) years.push(last - i);
  return years;
}

function idb() {
  return new Promise(function (resolve, reject) {
    var rq = indexedDB.open('ene-working-model', 1);
    rq.onupgradeneeded = function () {
      rq.result.createObjectStore('datasets');
      rq.result.createObjectStore('results');
    };
    rq.onsuccess = function () { resolve(rq.result); };
    rq.onerror = function () { reject(rq.error); };
  });
}
function idbGet(store, key) {
  return idb().then(function (db) {
    return new Promise(function (resolve) {
      var rq = db.transaction(store).objectStore(store).get(key);
      rq.onsuccess = function () { resolve(rq.result || null); };
      rq.onerror = function () { resolve(null); };
    });
  }).catch(function () { return null; });
}
function idbPut(store, key, value) {
  return idb().then(function (db) {
    return new Promise(function (resolve) {
      var rq = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
      rq.onsuccess = function () { resolve(true); };
      rq.onerror = function () { resolve(false); };
    });
  }).catch(function () { return false; });
}

function cacheKey(lat, lon, years) {
  return lat.toFixed(3) + ',' + lon.toFixed(3) + '|' + years.join('-');
}

function parseArchiveJson(j) {
  var rows = [];
  var times = j.hourly.time, dni = j.hourly.direct_normal_irradiance,
      tmp = j.hourly.temperature_2m;
  var lastTemp = 15;
  for (var i = 0; i < times.length; i++) {
    var t = tmp[i];
    if (t === null || t === undefined) t = lastTemp; else lastTemp = t;
    var d = dni[i];
    if (d === null || d === undefined) d = 0;
    rows.push([times[i], d, t]);
  }
  return rows;
}

function fetchOpenMeteo(lat, lon, years, onProgress) {
  var all = [];
  var chain = Promise.resolve();
  years.forEach(function (yr) {
    chain = chain.then(function () {
      onProgress('Fetching ' + yr + ' from Open-Meteo Archive…');
      var url = ARCHIVE + '?latitude=' + lat + '&longitude=' + lon
        + '&start_date=' + yr + '-01-01&end_date=' + yr + '-12-31'
        + '&hourly=direct_normal_irradiance,temperature_2m&timezone=GMT';
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        all = all.concat(parseArchiveJson(j));
      });
    });
  });
  return chain.then(function () {
    return { rows: all, source: 'Open-Meteo Archive API (ERA5-based)',
             endpoint: ARCHIVE };
  });
}

function fetchNasa(lat, lon, years, onProgress) {
  var all = [];
  var chain = Promise.resolve();
  years.forEach(function (yr) {
    chain = chain.then(function () {
      onProgress('Fetching ' + yr + ' from NASA POWER (fallback)…');
      var url = NASA + '?parameters=ALLSKY_SFC_SW_DNI,T2M&community=RE'
        + '&longitude=' + lon + '&latitude=' + lat
        + '&start=' + yr + '0101&end=' + yr + '1231'
        + '&format=JSON&time-standard=UTC';
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('NASA POWER HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        var par = j.properties.parameter;
        var dniMap = par.ALLSKY_SFC_SW_DNI, tMap = par.T2M;
        var keys = Object.keys(dniMap).sort();
        var lastTemp = 15;
        keys.forEach(function (k) {
          var ts = k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6, 8)
                   + 'T' + k.slice(8, 10) + ':00';
          var d = dniMap[k]; if (d < -900) d = 0;
          var t = tMap[k]; if (t < -900) t = lastTemp; else lastTemp = t;
          all.push([ts, d, t]);
        });
      });
    });
  });
  return chain.then(function () {
    return { rows: all, source: 'NASA POWER hourly API (fallback)',
             endpoint: NASA + ' (time-standard=UTC)' };
  });
}

/* Fetch a city, cache-first. Returns a dataset object. */
function fetchCity(lat, lon, label, years, onProgress) {
  var key = cacheKey(lat, lon, years);
  return idbGet('datasets', key).then(function (cached) {
    if (cached && cached.rows && cached.rows.length) {
      cached.fromCache = true;
      return cached;
    }
    onProgress('Contacting weather archive…');
    return fetchOpenMeteo(lat, lon, years, onProgress)
      .catch(function () {
        return fetchNasa(lat, lon, years, onProgress);
      })
      .then(function (res) {
        var ds = {
          key: key, label: label, lat: lat, lon: lon, rows: res.rows,
          fromCache: false,
          provenance: {
            source: res.source, endpoint: res.endpoint,
            latitude: lat, longitude: lon,
            period: res.rows.length
              ? res.rows[0][0] + ' to ' + res.rows[res.rows.length - 1][0]
              : '',
            variables: 'direct_normal_irradiance (W/m²), temperature_2m (°C), hourly, UTC',
            fetched: new Date().toISOString().slice(0, 10),
            hours: res.rows.length
          }
        };
        return idbPut('datasets', key, ds).then(function () { return ds; });
      });
  });
}

function geocode(name) {
  var url = GEOCODE + '?name=' + encodeURIComponent(name)
    + '&count=6&language=en&format=json';
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error('geocoding HTTP ' + r.status);
    return r.json();
  }).then(function (j) { return j.results || []; });
}

/* Load the bundled Lewisville year (served with the page). */
function loadBundled() {
  return Promise.all([
    fetch('data/lewisville-tx-2024-open-meteo.csv').then(function (r) {
      if (!r.ok) throw new Error('bundled CSV HTTP ' + r.status);
      return r.text();
    }),
    fetch('data/lewisville-tx-2024-open-meteo.meta.json').then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; })
  ]).then(function (pair) {
    var lines = pair[0].trim().split('\n').slice(1);
    var rows = lines.map(function (l) {
      var c = l.split(',');
      return [c[0], parseFloat(c[1]), parseFloat(c[2])];
    });
    var meta = pair[1] || {};
    return {
      key: 'bundled-lewisville-2024', label: 'Lewisville, Texas (bundled)',
      lat: 33.046, lon: -96.994, rows: rows, fromCache: false, bundled: true,
      provenance: {
        source: meta.source || 'Open-Meteo Archive API (ERA5-based)',
        endpoint: meta.endpoint || ARCHIVE,
        latitude: meta.returned_latitude || 33.07557,
        longitude: meta.returned_longitude || -96.96561,
        period: meta.period || '2024-01-01 to 2024-12-31',
        variables: 'direct_normal_irradiance (W/m²), temperature_2m (°C), hourly, UTC',
        fetched: meta.fetched || '2026-10-24',
        hours: rows.length,
        note: 'Bundled extract shipped with the model so the page demonstrates with zero waiting. Grid point returned by the archive for the requested coordinates.'
      }
    };
  });
}

/* Run the solver over a dataset and slice the results. Chunked by awaiting
 * between phases so the progress text paints honestly. */
function analyze(ds, loadCap, valveReversed, onProgress) {
  var rkey = ds.key + '|load=' + loadCap + '|rev=' + (valveReversed ? 1 : 0);
  return idbGet('results', rkey).then(function (cached) {
    if (cached) { cached.fromCache = true; return cached; }
    onProgress('Simulating ' + ds.rows.length.toLocaleString()
               + ' hours of weather…');
    return new Promise(function (resolve) {
      setTimeout(function () {
        var p = Object.assign({}, ENE.PARAMS,
                              { latitude: ds.lat, longitude: ds.lon,
                                start_day_of_year: 1 });
        var hourly = ds.rows.map(function (r) { return [r[1], r[2]]; });
        var t0 = Date.now();
        var res = ENE.simulate(p, hourly, 0.25, loadCap, valveReversed, true);
        var steps = res.steps;
        // cumAt(timeH): cumulative net kWh through timeH (steps carry
        // end-of-step cumulatives at their start time label).
        function cumAt(timeH, col) {
          var lo = 0, hi = steps.length - 1, ans = 0;
          while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (steps[mid].t_h < timeH - 1e-9) { ans = steps[mid][col]; lo = mid + 1; }
            else hi = mid - 1;
          }
          return ans;
        }
        // Day index from rows.
        var days = []; // {date, startH, endH, dniKwh}
        var cur = null;
        ds.rows.forEach(function (r, i) {
          var date = r[0].slice(0, 10);
          if (!cur || cur.date !== date) {
            if (cur) days.push(cur);
            cur = { date: date, startH: i, endH: i + 1, dniKwh: 0,
                    tempSum: 0, hours: 0 };
          }
          cur.endH = i + 1;
          cur.dniKwh += r[1] / 1000;
          cur.tempSum += r[2];
          cur.hours += 1;
        });
        if (cur) days.push(cur);
        days.forEach(function (d) {
          d.netKwh = cumAt(d.endH, 'cum_net_kwh') - cumAt(d.startH, 'cum_net_kwh');
          d.meanTemp = d.tempSum / d.hours;
        });
        var months = {};
        days.forEach(function (d) {
          var mk = d.date.slice(0, 7);
          if (!months[mk]) months[mk] = { key: mk, netKwh: 0, dniKwh: 0, tempSum: 0, days: 0 };
          months[mk].netKwh += d.netKwh;
          months[mk].dniKwh += d.dniKwh;
          months[mk].tempSum += d.meanTemp;
          months[mk].days += 1;
        });
        var monthList = Object.keys(months).sort().map(function (k) {
          var m = months[k];
          m.meanTemp = m.tempSum / m.days;
          return m;
        });
        var seasons = { DJF: 0, MAM: 0, JJA: 0, SON: 0 };
        monthList.forEach(function (m) {
          var mo = parseInt(m.key.slice(5, 7), 10);
          var s = (mo === 12 || mo <= 2) ? 'DJF' : (mo <= 5 ? 'MAM' : (mo <= 8 ? 'JJA' : 'SON'));
          seasons[s] += m.netKwh;
        });
        // Hour x month average net kW from step records.
        var heat = [], counts = [];
        for (var mm = 0; mm < 12; mm++) { heat.push(new Array(24).fill(0)); counts.push(new Array(24).fill(0)); }
        steps.forEach(function (s) {
          var hourIdx = Math.floor(s.t_h);
          if (hourIdx < 0 || hourIdx >= ds.rows.length) return;
          var row = ds.rows[hourIdx];
          var mo = parseInt(row[0].slice(5, 7), 10) - 1;
          var hr = parseInt(row[0].slice(11, 13), 10);
          heat[mo][hr] += s.p_net_kw;
          counts[mo][hr] += 1;
        });
        for (var a = 0; a < 12; a++) for (var b = 0; b < 24; b++)
          heat[a][b] = counts[a][b] ? heat[a][b] / counts[a][b] : 0;
        var sorted = days.slice().sort(function (x, y) { return x.netKwh - y.netKwh; });
        var median = sorted[Math.floor(sorted.length / 2)];
        var best = sorted[sorted.length - 1], worst = sorted[0];
        // Cloudy stretches: days under 1.0 kWh/m2 of DNI.
        var longest = 0, runLen = 0, longestEnd = null;
        days.forEach(function (d) {
          if (d.dniKwh < 1.0) { runLen += 1; if (runLen > longest) { longest = runLen; longestEnd = d.date; } }
          else runLen = 0;
        });
        // Temperature effect: monthly output per unit of sunlight, warmest
        // vs coolest month, plus mean condenser temperature while generating.
        var condSum = 0, condN = 0;
        steps.forEach(function (s) {
          if (s.p_net_kw > 0.05) { condSum += s.condenser_temp_c; condN += 1; }
        });
        var byTemp = monthList.slice().sort(function (x, y) { return x.meanTemp - y.meanTemp; });
        var coolest = byTemp[0], warmest = byTemp[byTemp.length - 1];
        var totalHours = ds.rows.length;
        var out = {
          key: rkey, label: ds.label, fromCache: false,
          netKwh: res.total_net_kwh, grossKwh: res.total_gross_kwh,
          solarKwh: res.total_solar_kwh, peakKw: res.peak_net_kw,
          capacityFactor: res.total_net_kwh / (7.0 * totalHours),
          months: monthList, seasons: seasons, heatmap: heat,
          bestDay: { date: best.date, netKwh: best.netKwh },
          worstDay: { date: worst.date, netKwh: worst.netKwh },
          medianDay: { date: median.date, netKwh: median.netKwh },
          zeroDays: days.filter(function (d) { return d.netKwh <= 0.001; }).length,
          longestCloudyStretch: { days: longest, ending: longestEnd },
          meanCondenserTempWhileGenerating: condN ? condSum / condN : null,
          coolestMonth: { key: coolest.key, meanTemp: coolest.meanTemp,
                          netPerDni: coolest.dniKwh ? coolest.netKwh / (coolest.dniKwh * 40) : 0 },
          warmestMonth: { key: warmest.key, meanTemp: warmest.meanTemp,
                          netPerDni: warmest.dniKwh ? warmest.netKwh / (warmest.dniKwh * 40) : 0 },
          waterDeltaKg: res.water_delta_kg,
          balanceResidualKwh: res.balance_residual_kwh,
          simSeconds: (Date.now() - t0) / 1000
        };
        idbPut('results', rkey, out);
        resolve(out);
      }, 30);
    });
  });
}

global.ENE_WX = {
  completeYears: completeYears, fetchCity: fetchCity, geocode: geocode,
  loadBundled: loadBundled, analyze: analyze, cacheKey: cacheKey,
  ARCHIVE: ARCHIVE, NASA: NASA
};
})(typeof window !== 'undefined' ? window : globalThis);
