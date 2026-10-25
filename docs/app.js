/* Energy Not Enemy: The Working Model, page application.
 * Hand-written. Wires the JS solver port (solver.js), the weather layer
 * (weather.js), and the WebGL scene (gl.js) together. */
(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
var fmt = function (x, n) { return (x === null || x === undefined) ? '…'
  : Number(x).toFixed(n === undefined ? 2 : n); };

var PRESETS = [
  { name: 'Lewisville, Texas', kind: 'default', lat: 33.046, lon: -96.994 },
  { name: 'Phoenix, Arizona', kind: 'desert', lat: 33.448, lon: -112.074 },
  { name: 'Seattle, Washington', kind: 'northern, cloudy', lat: 47.606, lon: -122.332 },
  { name: 'Miami, Florida', kind: 'coastal', lat: 25.762, lon: -80.192 },
  { name: 'Singapore', kind: 'equatorial', lat: 1.352, lon: 103.820 }
];

var state = {
  dataset: null, analysis: null, analysisLoad: 5.0,
  date: null, daySteps: [], stepFloat: 0, playing: true,
  speed: 240, loadCap: 5.0, valveReversed: false,
  part: 'all', cities: {} // label -> {dataset, analysis}
};
var renderer = null;
var lastFrameMs = 0;

/* ---------------- day simulation ---------------- */
function dayOfYear(dateStr) {
  var d = new Date(dateStr + 'T00:00:00Z');
  var jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - jan1) / 86400000) + 1;
}
function datePlus(dateStr, days) {
  var d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function dayStartIndex(ds, dateStr) {
  for (var i = 0; i < ds.rows.length; i++)
    if (ds.rows[i][0].slice(0, 10) === dateStr) return i;
  return -1;
}
function buildDay() {
  var ds = state.dataset;
  if (!ds || !state.date) return;
  var idx = dayStartIndex(ds, state.date);
  if (idx < 0) return;
  var start = Math.max(0, idx - 24);
  var warmHours = idx - start;
  var hourly = ds.rows.slice(start, idx + 24).map(function (r) { return [r[1], r[2]]; });
  var p = Object.assign({}, ENE.PARAMS, {
    latitude: ds.lat, longitude: ds.lon,
    start_day_of_year: dayOfYear(ds.rows[start][0].slice(0, 10))
  });
  var res = ENE.simulate(p, hourly, 0.05, state.loadCap, state.valveReversed, true);
  var sliceAt = Math.round(warmHours / 0.05);
  state.daySteps = res.steps.slice(sliceAt);
  // Make the phase panel's cumulative numbers describe the displayed day:
  // subtract the warm-up day's cumulative totals (the state itself, boiler
  // temperature and inventories, still carries over, which is the point of
  // the warm-up).
  if (sliceAt > 0 && state.daySteps.length) {
    var base = res.steps[sliceAt - 1];
    var CUMS = ['cum_solar_kwh', 'cum_optical_kwh', 'cum_heat_kwh',
      'cum_enthalpy_kwh', 'cum_shaft_kwh', 'cum_gross_kwh', 'cum_net_kwh',
      'cum_condenser_kwh', 'cum_optical_loss_kwh', 'cum_receiver_loss_kwh',
      'cum_standby_loss_kwh'];
    state.daySteps.forEach(function (s) {
      CUMS.forEach(function (c) { s[c] = Math.max(0, s[c] - base[c]); });
    });
  }
  state.stepFloat = 0;
  $('scrub').max = state.daySteps.length - 1;
  drawPowerChart();
  updateTotals();
}
function currentStep() {
  if (!state.daySteps.length) return null;
  var i = Math.min(state.daySteps.length - 1, Math.floor(state.stepFloat));
  return state.daySteps[i];
}

/* ---------------- phase panel ---------------- */
var PHASES = [
  { id: 'solar', name: '1 · Solar input',
    val: function (s) { return [s.p_solar_kw, s.cum_solar_kwh]; },
    eq: 'P = DNI × A<sub>aperture</sub>',
    inputs: function (s) { return 'DNI ' + fmt(s.dni_w_m2, 0) + ' W/m² × 40 m²'; } },
  { id: 'heat', name: '2 · Concentrated heat',
    val: function (s) { return [s.p_heat_kw, s.cum_heat_kwh]; },
    eq: 'P = P<sub>solar</sub> × η<sub>optical</sub> 0.75 × η<sub>receiver</sub> 0.67',
    inputs: function (s) { return 'receiver at ' + fmt(s.receiver_temp_c, 0) + ' °C, flux '
      + fmt(s.p_heat_kw * 1000 / 0.67, 0) + ' W/m² on 0.67 m²'; } },
  { id: 'enthalpy', name: '3 · Boiler steam enthalpy',
    val: function (s) { return [s.boiler_enthalpy_flow_kw, s.cum_enthalpy_kwh]; },
    eq: 'ṁ × h(P, T) from the steam correlations',
    inputs: function (s) { return 'boiler ' + fmt(s.boiler_temp_c, 0) + ' °C, '
      + fmt(s.boiler_pressure_mpa, 2) + ' MPa, saturation '
      + fmt(s.sat_temp_c, 0) + ' °C, superheat ' + fmt(s.superheat_c, 0)
      + ' °C, steam held ' + fmt(s.steam_kg, 1) + ' kg'; } },
  { id: 'valve', name: '4 · Valve pass',
    val: function (s) { return [s.boiler_enthalpy_flow_kw, s.cum_enthalpy_kwh]; },
    eq: 'ΔP = K ṁ², K doubled when reversed; Di from Re',
    inputs: function (s) { return 'flow ' + fmt(s.turbine_flow_kg_h, 1) + ' kg/h, Re '
      + fmt(s.reynolds, 0) + ', Di ' + fmt(s.diodicity, 2) + ', ΔP '
      + fmt(s.valve_dp_pa / 1000, 1) + ' kPa, direction '
      + (s.flow_direction > 0 ? 'power leg' : (s.flow_direction < 0 ? 'return leg' : 'idle'))
      + (s.bypass_flow_kg_h > 0.05 ? ', bypass leak ' + fmt(s.bypass_flow_kg_h, 1) + ' kg/h' : ''); } },
  { id: 'shaft', name: '5 · Turbine shaft',
    val: function (s) { return [s.p_shaft_kw, s.cum_shaft_kwh]; },
    eq: 'P = ṁ × Δh × η<sub>turbine</sub> 0.75',
    inputs: function (s) { return 'Δh ' + fmt(s.enthalpy_drop_kj_kg, 0)
      + ' kJ/kg, inlet ' + fmt(s.turbine_inlet_mpa, 2) + ' MPa, '
      + fmt(s.rpm, 0) + ' rpm'; } },
  { id: 'elec', name: '6 · Electrical output',
    val: function (s) { return [s.p_net_kw, s.cum_net_kwh]; },
    eq: 'P<sub>net</sub> = P<sub>shaft</sub> × η<sub>gen</sub> 0.95 − pump − controls',
    inputs: function (s) { return 'gross ' + fmt(s.p_gross_kw, 2) + ' kW, parasitics '
      + fmt(s.p_parasitic_kw, 3) + ' kW (pump ' + fmt(s.p_pump_kw, 3) + ')'; } },
  { id: 'cond', name: '7 · Condenser recovery',
    val: function (s) { return [s.p_condenser_kw, s.cum_condenser_kwh]; },
    eq: 'Q = U × A × (T<sub>cond</sub> − T<sub>amb</sub>), U = 8, A = 51 m²',
    inputs: function (s) { return 'condenser ' + fmt(s.condenser_temp_c, 1)
      + ' °C vs ambient ' + fmt(s.ambient_c, 1) + ' °C, condensing '
      + fmt(s.condensed_kg_h, 1) + ' kg/h, returning ' + fmt(s.return_kg_h, 1)
      + ' kg/h, water in condenser ' + fmt(s.condenser_kg, 1) + ' kg'; } }
];
var phaseEls = {};
function buildPhases() {
  var host = $('phases');
  PHASES.forEach(function (ph) {
    var d = document.createElement('details');
    var sum = document.createElement('summary');
    sum.innerHTML = '<span class="pname">' + ph.name + '</span>'
      + '<span class="pvals"><span class="inst"></span> kW · <span class="cum"></span> kWh</span>';
    var body = document.createElement('div');
    body.className = 'peq';
    body.innerHTML = '<span class="eq">' + ph.eq + '</span><br><span class="pin"></span>';
    d.appendChild(sum); d.appendChild(body);
    host.appendChild(d);
    phaseEls[ph.id] = { inst: sum.querySelector('.inst'),
                        cum: sum.querySelector('.cum'),
                        pin: body.querySelector('.pin'), def: ph };
  });
}
function updatePhases(s) {
  PHASES.forEach(function (ph) {
    var el = phaseEls[ph.id];
    var v = ph.val(s);
    el.inst.textContent = fmt(v[0], 3);
    el.cum.textContent = fmt(v[1], 2);
    el.pin.textContent = ph.inputs(s);
  });
}

/* ---------------- part readout ---------------- */
var PART_INFO = {
  all: { name: 'Whole plant', note: 'Click any part, or use the chips above the scene, to isolate it and read its live numbers.' },
  fresnel: { name: 'Fresnel array', note: 'Forty modules of 1 m². The book gives the module size as about 1 to 2 m² (B-66) and the reference aperture as about 40 m² (B-46). The boost mirrors are drawn in the aperture chain; they get no separate energy multiplier, because the book states none (A-09).' },
  receiver: { name: 'Receiver', note: 'Target area 0.67 m² from the concentration ratio of 60 (B-47).' },
  boiler: { name: 'Boiler vessel', note: 'Vessel volume 1.6 m³ is an assumption (A-29), chosen so the steam space holds about the 25 kg buffer at the design point. The book fixes the duty and the 4 MPa, 400 °C design point, not a fabrication drawing.' },
  valve: { name: 'Tesla valve', note: 'Eleven stages (A-11, from the robust study the book cites). Diodicity about 2 in the plateau (B-37). The serpentine channel is the flow path; use the spread slider to explode the stages.' },
  turbine: { name: 'Steam turbine', note: 'Power class 5 to 7 kW (B-50). Rated speed 3,000 rpm is an assumption (A-15). Blade speed on screen is proportional to the solver rpm, geared down so it can be seen.' },
  generator: { name: 'Generator', note: 'Efficiency 0.95 (B-55). The 7 kW nameplate used for capacity factor is the top of the book class (A-16). The front disc glows with computed output.' },
  condenser: { name: 'Condenser', note: 'Twelve panels totaling the book’s 51 m² (B-49), passive air cooling at U = 8 W/m²·K (B-33). Droplets fall when the solver is condensing steam.' },
  loop: { name: 'Loop piping and feed pump', note: 'The sealed loop. Total water is 250 kg (A-02) and the solver accounts for every gram of it.' }
};
function partNumbers(pid, s) {
  var rows = [];
  function r(k, v) { rows.push([k, v]); }
  if (!s) return rows;
  switch (pid) {
    case 'fresnel':
      r('Sun elevation', fmt(s.solar_elev_deg, 1) + '°');
      r('DNI', fmt(s.dni_w_m2, 0) + ' W/m²');
      r('Power on aperture', fmt(s.p_solar_kw, 2) + ' kW');
      r('After optics', fmt(s.p_optical_kw, 2) + ' kW');
      break;
    case 'receiver':
      r('Receiver temperature', fmt(s.receiver_temp_c, 0) + ' °C');
      r('Heat delivered', fmt(s.p_heat_kw, 2) + ' kW');
      r('Flux on receiver', fmt(s.p_heat_kw * 1000 / 0.67, 0) + ' W/m²');
      break;
    case 'boiler':
      r('Temperature', fmt(s.boiler_temp_c, 1) + ' °C');
      r('Pressure', fmt(s.boiler_pressure_mpa, 3) + ' MPa');
      r('Saturation temp', fmt(s.sat_temp_c, 1) + ' °C');
      r('Superheat', fmt(s.superheat_c, 1) + ' °C');
      r('Steam held', fmt(s.steam_kg, 2) + ' kg');
      r('Water in boiler', fmt(s.boiler_kg, 1) + ' kg');
      break;
    case 'valve':
      r('Flow', fmt(s.turbine_flow_kg_h, 1) + ' kg/h');
      r('Reynolds number', fmt(s.reynolds, 0));
      r('Diodicity Di', fmt(s.diodicity, 2));
      r('Pressure drop', fmt(s.valve_dp_pa / 1000, 1) + ' kPa');
      r('Bypass leak', fmt(s.bypass_flow_kg_h, 2) + ' kg/h');
      break;
    case 'turbine':
      r('Inlet pressure', fmt(s.turbine_inlet_mpa, 2) + ' MPa');
      r('Enthalpy drop', fmt(s.enthalpy_drop_kj_kg, 0) + ' kJ/kg');
      r('Shaft power', fmt(s.p_shaft_kw, 2) + ' kW');
      r('Speed', fmt(s.rpm, 0) + ' rpm');
      break;
    case 'generator':
      r('Gross output', fmt(s.p_gross_kw, 2) + ' kW');
      r('Parasitics', fmt(s.p_parasitic_kw, 3) + ' kW');
      r('Net output', fmt(s.p_net_kw, 2) + ' kW');
      break;
    case 'condenser':
      r('Temperature', fmt(s.condenser_temp_c, 1) + ' °C');
      r('Heat rejected', fmt(s.p_condenser_kw, 2) + ' kW');
      r('Condensing', fmt(s.condensed_kg_h, 1) + ' kg/h');
      r('Returning', fmt(s.return_kg_h, 1) + ' kg/h');
      r('Water held', fmt(s.condenser_kg, 1) + ' kg');
      break;
    default:
      r('Net power', fmt(s.p_net_kw, 2) + ' kW');
      r('Boiler', fmt(s.boiler_temp_c, 0) + ' °C · ' + fmt(s.boiler_pressure_mpa, 2) + ' MPa');
      r('Turbine', fmt(s.rpm, 0) + ' rpm');
      r('Total water', fmt(s.total_water_kg, 3) + ' kg');
  }
  return rows;
}
function updatePartReadout(s) {
  var info = PART_INFO[state.part] || PART_INFO.all;
  $('part-name').textContent = info.name;
  $('part-note').textContent = info.note;
  var host = $('part-numbers');
  host.innerHTML = '';
  partNumbers(state.part, s).forEach(function (kv) {
    var dt = document.createElement('dt'); dt.textContent = kv[0];
    var dd = document.createElement('dd'); dd.textContent = kv[1];
    host.appendChild(dt); host.appendChild(dd);
  });
}

/* ---------------- totals and charts ---------------- */
function updateTotals() {
  var host = $('totals');
  host.innerHTML = '';
  if (!state.daySteps.length) return;
  var last = state.daySteps[state.daySteps.length - 1];
  // Day steps were sliced from a warm-up run; their cumulatives include the
  // warm-up day, so day totals are integrated from instantaneous powers.
  var dtH = 0.05;
  var sum = { net: 0, gross: 0, solar: 0, peak: 0 };
  state.daySteps.forEach(function (s) {
    sum.net += s.p_net_kw * dtH; sum.gross += s.p_gross_kw * dtH;
    sum.solar += s.p_solar_kw * dtH; sum.peak = Math.max(sum.peak, s.p_net_kw);
  });
  var rows = [
    ['Net electricity', fmt(sum.net, 2) + ' kWh'],
    ['Gross electricity', fmt(sum.gross, 2) + ' kWh'],
    ['Sunlight on aperture', fmt(sum.solar, 1) + ' kWh'],
    ['Peak net power', fmt(sum.peak, 2) + ' kW'],
    ['Day capacity factor (7 kW)', fmt(sum.net / (7 * 24) * 100, 1) + '%'],
    ['Water at day start', fmt(state.daySteps[0].total_water_kg, 3) + ' kg'],
    ['Water at day end', fmt(last.total_water_kg, 3) + ' kg'],
    ['Water gained or lost', fmt(last.total_water_kg - state.daySteps[0].total_water_kg, 4) + ' kg'],
    ['Book reference demand', '30 kWh/day (B-01)'],
    ['Share of reference demand', fmt(sum.net / 30 * 100, 1) + '%']
  ];
  rows.forEach(function (kv) {
    var dt = document.createElement('dt'); dt.textContent = kv[0];
    var dd = document.createElement('dd'); dd.textContent = kv[1];
    host.appendChild(dt); host.appendChild(dd);
  });
}
function drawPowerChart() {
  var cv = $('power-chart');
  if (!state.chartClean) {
    state.chartClean = document.createElement('canvas');
    state.chartClean.width = cv.width; state.chartClean.height = cv.height;
  }
  var ctx = state.chartClean.getContext('2d');
  var W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  if (!state.daySteps.length) return;
  var maxKw = 6, padL = 44, padB = 22, padT = 10;
  var x = function (t) { return padL + (W - padL - 10) * (t / 24); };
  var y = function (kw) { return H - padB - (H - padB - padT) * (kw / maxKw); };
  ctx.strokeStyle = '#d8d2c2'; ctx.fillStyle = '#5c6656';
  ctx.font = '11px Georgia';
  for (var g = 0; g <= 6; g++) {
    ctx.beginPath(); ctx.moveTo(padL, y(g)); ctx.lineTo(W - 10, y(g)); ctx.stroke();
    ctx.fillText(g + ' kW', 4, y(g) + 4);
  }
  for (var hh = 0; hh <= 24; hh += 4) ctx.fillText(hh + ':00', x(hh) - 10, H - 6);
  function line(get, color, dash) {
    ctx.strokeStyle = color; ctx.setLineDash(dash || []);
    ctx.beginPath();
    state.daySteps.forEach(function (s, i) {
      var px = x(i * 0.05);
      var py = y(get(s));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke(); ctx.setLineDash([]);
  }
  line(function (s) { return s.dni_w_m2 / 1000 * 3; }, '#e0b64f');
  line(function (s) { return s.p_gross_kw; }, '#8aa5b5', [5, 4]);
  line(function (s) { return s.p_net_kw; }, '#c8501e');
  ctx.fillStyle = '#c8501e'; ctx.fillText('net kW', W - 120, 20);
  ctx.fillStyle = '#8aa5b5'; ctx.fillText('gross kW', W - 120, 36);
  ctx.fillStyle = '#a8862a'; ctx.fillText('sunlight (scaled)', W - 120, 52);
  cv.getContext('2d').drawImage(state.chartClean, 0, 0);
  lastCursorStep = -1;
}
function drawPowerCursor() {
  // Redraw cheaply: chart is redrawn on day change; cursor drawn on top.
  var cv = $('power-chart'), ctx = cv.getContext('2d');
  if (!state.daySteps.length) return;
  var W = cv.width, padL = 44;
  var i = Math.min(state.daySteps.length - 1, Math.floor(state.stepFloat));
  var px = padL + (W - padL - 10) * ((i * 0.05) / 24);
  ctx.strokeStyle = 'rgba(30,60,90,0.55)';
  ctx.beginPath(); ctx.moveTo(px, 8); ctx.lineTo(px, cv.height - 22); ctx.stroke();
}

/* ---------------- HUD and main loop ---------------- */
var labelDivs = {};
function buildLabels() {
  var host = $('part-labels');
  Object.keys(renderer.parts).forEach(function (pid) {
    if (pid === 'ground') return;
    var d = document.createElement('div');
    d.className = 'part-label';
    d.textContent = renderer.parts[pid].label;
    host.appendChild(d);
    labelDivs[pid] = d;
  });
}
function clockText(s) {
  if (!s || !state.date) return '…';
  var mins = Math.floor((state.stepFloat * 0.05) * 60);
  var hh = Math.floor(mins / 60), mm = mins % 60;
  return state.date + ' · ' + String(hh).padStart(2, '0') + ':'
    + String(mm).padStart(2, '0') + ' UTC · sun '
    + fmt(s.solar_elev_deg, 1) + '° · ' + fmt(s.p_net_kw, 2) + ' kW net';
}
var lastCursorStep = -1;
function frame(now) {
  requestAnimationFrame(frame);
  var dtReal = Math.min(0.1, (now - lastFrameMs) / 1000 || 0.016);
  lastFrameMs = now;
  var s = currentStep();
  var advanceH = 0;
  if (state.playing && state.daySteps.length) {
    advanceH = state.speed * dtReal / 60;
    state.stepFloat += advanceH / 0.05;
    if (state.stepFloat >= state.daySteps.length) state.stepFloat = 0;
    s = currentStep();
  }
  if (!s) return;
  renderer.setSimDt(advanceH);
  renderer.update(s, dtReal);
  var out = renderer.render(s);
  if (out && out.vp) {
    Object.keys(labelDivs).forEach(function (pid) {
      var a = renderer.parts[pid].anchor;
      var p = renderer.project(out.vp, a);
      var d = labelDivs[pid];
      if (p.behind || p.x < -40 || p.x > 1040 || p.y < -20 || p.y > 640) {
        d.style.display = 'none';
      } else {
        d.style.display = '';
        d.style.left = p.x + 'px';
        d.style.top = p.y + 'px';
      }
    });
  }
  $('clock-text').textContent = clockText(s);
  $('scrub-label').textContent = clockText(s).split('·')[1] || '';
  if (Math.floor(state.stepFloat) !== lastCursorStep) {
    lastCursorStep = Math.floor(state.stepFloat);
    $('scrub').value = lastCursorStep;
    if (state.chartClean) {
      var ctx = $('power-chart').getContext('2d');
      ctx.drawImage(state.chartClean, 0, 0);
      drawPowerCursor();
    }
  }
  updatePhases(s);
  updatePartReadout(s);
}

/* ---------------- city and analysis UI ---------------- */
function provenanceText(ds) {
  var p = ds.provenance;
  return 'Data: ' + p.source + ' · endpoint ' + p.endpoint
    + ' · grid point ' + p.latitude + ', ' + p.longitude
    + ' · period ' + p.period + ' · ' + p.variables
    + ' · fetched ' + p.fetched + ' · ' + p.hours.toLocaleString() + ' hours'
    + (ds.bundled ? ' · bundled with the model' : '')
    + (ds.fromCache ? ' · served from this device’s cache (works offline)' : '')
    + (p.note ? ' · ' + p.note : '');
}
function setDataset(ds, analysis) {
  state.dataset = ds;
  state.analysis = analysis || null;
  if (analysis) state.analysisLoad = state.loadCap;
  $('provenance').textContent = provenanceText(ds);
  var first = ds.rows[0][0].slice(0, 10), lastD = ds.rows[ds.rows.length - 1][0].slice(0, 10);
  var di = $('date-input');
  di.min = first; di.max = lastD;
  state.date = analysis ? analysis.medianDay.date : first;
  di.value = state.date;
  $('lat-input').value = ds.lat;
  $('lon-input').value = ds.lon;
  buildDay();
  renderAnalysis();
}
function progress(show, frac, text) {
  $('progress-wrap').hidden = !show;
  if (show) { $('progress').value = frac * 100; $('progress-text').textContent = text; }
  $('fetch-status').textContent = text || '';
}
function loadCity(lat, lon, label, years) {
  progress(true, 0.05, 'Loading ' + label + '…');
  return ENE_WX.fetchCity(lat, lon, label, years, function (msg) {
    progress(true, 0.3, msg);
  }).then(function (ds) {
    progress(true, 0.55, 'Weather ready: ' + ds.rows.length.toLocaleString()
      + ' hours. Simulating…');
    return ENE_WX.analyze(ds, state.loadCap, state.valveReversed,
      function (msg) { progress(true, 0.7, msg); })
      .then(function (analysis) {
        progress(false, 1, '');
        state.cities[ds.label] = { dataset: ds, analysis: analysis };
        renderLoadedCities();
        setDataset(ds, analysis);
        return ds;
      });
  }).catch(function (err) {
    progress(false, 0, '');
    $('fetch-status').textContent = 'Could not load ' + label + ': '
      + err.message + '. Check the connection, or use the bundled Lewisville year.';
    throw err;
  });
}
function renderLoadedCities() {
  var host = $('loaded-cities');
  host.innerHTML = '<h4>Places loaded on this device</h4>';
  Object.keys(state.cities).forEach(function (label) {
    var c = state.cities[label];
    var row = document.createElement('div');
    row.className = 'row wrap';
    var b = document.createElement('button');
    b.textContent = 'View ' + label;
    b.addEventListener('click', function () { setDataset(c.dataset, c.analysis); });
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true;
    cb.addEventListener('change', renderComparison);
    var lab = document.createElement('label');
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' compare'));
    row.appendChild(b); row.appendChild(lab);
    row.dataset.label = label;
    host.appendChild(row);
  });
  renderComparison();
}
function comparedCities() {
  var out = [];
  $('loaded-cities').querySelectorAll('div.row').forEach(function (row) {
    var cb = row.querySelector('input[type=checkbox]');
    if (cb && cb.checked && state.cities[row.dataset.label])
      out.push(state.cities[row.dataset.label]);
  });
  return out;
}
function renderComparison() {
  var host = $('comparison');
  var cities = comparedCities();
  if (cities.length < 2) { host.innerHTML = ''; return; }
  var metrics = [
    ['Annual net electricity', function (a) { return fmt(a.netKwh, 0) + ' kWh'; }],
    ['Capacity factor (7 kW)', function (a) { return fmt(a.capacityFactor * 100, 1) + '%'; }],
    ['Peak net power', function (a) { return fmt(a.peakKw, 2) + ' kW'; }],
    ['Best day', function (a) { return a.bestDay.date + ' · ' + fmt(a.bestDay.netKwh, 1) + ' kWh'; }],
    ['Median day', function (a) { return fmt(a.medianDay.netKwh, 1) + ' kWh'; }],
    ['Worst day', function (a) { return a.worstDay.date + ' · ' + fmt(a.worstDay.netKwh, 1) + ' kWh'; }],
    ['Days with no output', function (a) { return a.zeroDays; }],
    ['Longest cloudy stretch', function (a) { return a.longestCloudyStretch.days + ' days'; }],
    ['Water gained or lost', function (a) { return fmt(a.waterDeltaKg, 4) + ' kg'; }]
  ];
  var html = '<h4>Same machine, different weather</h4><table><tr><th>Measure</th>'
    + cities.map(function (c) { return '<th>' + c.dataset.label + '</th>'; }).join('')
    + '</tr>';
  metrics.forEach(function (m) {
    html += '<tr><td>' + m[0] + '</td>' + cities.map(function (c) {
      return '<td>' + m[1](c.analysis) + '</td>';
    }).join('') + '</tr>';
  });
  host.innerHTML = html + '</table>';
}
function renderAnalysis() {
  var a = state.analysis;
  var sum = $('analysis-summary');
  var mo = $('monthly');
  var ex = $('extremes');
  if (!a) {
    sum.innerHTML = '<dd>No period analysis yet. Load a place above.</dd>';
    mo.innerHTML = ''; ex.innerHTML = '';
    return;
  }
  sum.innerHTML = '';
  [['Place', a.label],
   ['Period net electricity', fmt(a.netKwh, 0) + ' kWh'],
   ['Capacity factor (7 kW nameplate)', fmt(a.capacityFactor * 100, 1) + '%'],
   ['Peak net power', fmt(a.peakKw, 2) + ' kW'],
   ['Seasons (net kWh)', 'winter ' + fmt(a.seasons.DJF, 0) + ' · spring '
     + fmt(a.seasons.MAM, 0) + ' · summer ' + fmt(a.seasons.JJA, 0)
     + ' · autumn ' + fmt(a.seasons.SON, 0)],
   ['Analysis load cap', fmt(state.analysisLoad, 1) + ' kW'],
   ['Water gained or lost over the period', fmt(a.waterDeltaKg, 4) + ' kg'],
   ['Energy balance residual', fmt(a.balanceResidualKwh, 1) + ' kWh']
  ].forEach(function (kv) {
    var dt = document.createElement('dt'); dt.textContent = kv[0];
    var dd = document.createElement('dd'); dd.textContent = kv[1];
    sum.appendChild(dt); sum.appendChild(dd);
  });
  var html = '<table><tr><th>Month</th><th>Net kWh</th><th>Sun on aperture (kWh/m²)</th><th>Mean temp °C</th></tr>';
  a.months.forEach(function (m) {
    html += '<tr><td>' + m.key + '</td><td>' + fmt(m.netKwh, 0) + '</td><td>'
      + fmt(m.dniKwh, 0) + '</td><td>' + fmt(m.meanTemp, 1) + '</td></tr>';
  });
  mo.innerHTML = html + '</table>';
  ex.innerHTML = '';
  [['Best day', a.bestDay], ['Worst day', a.worstDay], ['Median day', a.medianDay]]
    .forEach(function (pair) {
      var b = document.createElement('button');
      b.textContent = pair[0] + ': ' + pair[1].date + ' (' + fmt(pair[1].netKwh, 1) + ' kWh)';
      b.addEventListener('click', function () {
        state.date = pair[1].date;
        $('date-input').value = state.date;
        buildDay();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      ex.appendChild(b);
    });
  $('weather-effects').textContent =
    'Longest stretch of heavily overcast days (under 1 kWh/m² of direct sun): '
    + a.longestCloudyStretch.days + ' days, ending ' + a.longestCloudyStretch.ending
    + '. Days with no generation at all: ' + a.zeroDays
    + '. While generating, the condenser averaged '
    + fmt(a.meanCondenserTempWhileGenerating, 1)
    + ' °C. Heat costs output in this model, as the book’s condenser rule says it '
    + 'should: in the warmest month (' + a.warmestMonth.key + ', '
    + fmt(a.warmestMonth.meanTemp, 1) + ' °C) the machine made '
    + fmt(a.warmestMonth.netPerDni * 100, 1)
    + ' kWh per 100 kWh of sunlight on the lens, against '
    + fmt(a.coolestMonth.netPerDni * 100, 1) + ' in the coolest month ('
    + a.coolestMonth.key + ', ' + fmt(a.coolestMonth.meanTemp, 1) + ' °C).';
  drawHeatmap(a);
}
function drawHeatmap(a) {
  var cv = $('heatmap'), ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  var padL = 52, padT = 20, cw = (W - padL - 8) / 24, ch = (H - padT - 8) / 12;
  ctx.font = '10px Georgia'; ctx.fillStyle = '#5c6656';
  for (var hr = 0; hr < 24; hr += 2) ctx.fillText(hr + '', padL + hr * cw + 2, 14);
  var names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (var m = 0; m < 12; m++) {
    ctx.fillStyle = '#5c6656';
    ctx.fillText(names[m], 8, padT + m * ch + ch * 0.65);
    for (var h = 0; h < 24; h++) {
      var v = a.heatmap[m][h];
      var f = Math.min(1, v / 5);
      var rr = Math.floor(250 - f * 30), gg = Math.floor(245 - f * 150),
          bb = Math.floor(225 - f * 190);
      ctx.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
      ctx.fillRect(padL + h * cw + 0.5, padT + m * ch + 0.5, cw - 1, ch - 1);
    }
  }
}

/* ---------------- claims and assumptions ---------------- */
function renderClaims() {
  fetch('data/claims-check.json').then(function (r) { return r.json(); })
    .then(function (j) {
      var counts = {};
      j.claims.forEach(function (c) { counts[c.verdict] = (counts[c.verdict] || 0) + 1; });
      $('claims-counts').textContent = 'Verdicts from the verification battery: '
        + Object.keys(counts).map(function (k) { return k + ' ' + counts[k]; }).join(' · ')
        + '. Full workings are in results/claims-check.json in the repository.';
      var html = '<table><tr><th>ID</th><th>Book claim</th><th>Simulated result</th><th>Verdict</th></tr>';
      j.claims.forEach(function (c) {
        var cls = c.verdict.indexOf('AGREE') === 0 ? 'AGREE'
          : (c.verdict === 'PARTIAL' ? 'PARTIAL' : 'UNTESTABLE');
        html += '<tr><td>' + c.id + '</td><td>' + c.book + '</td><td>'
          + c.simulated + '<br><em>' + c.detail + '</em></td>'
          + '<td class="verdict-' + cls + '">' + c.verdict + '</td></tr>';
      });
      $('claims-table').innerHTML = html + '</table>';
    })
    .catch(function () {
      $('claims-counts').textContent = 'Claims data ships with the page (data/claims-check.json) and could not be loaded here.';
    });
}
var ASSUMPTIONS = [
  ['A-01', 'Time step', '0.05 h day view, 0.25 h period runs'],
  ['A-02', 'Total water inventory', '250 kg'],
  ['A-03', 'Boiler water at dawn', '180 kg'],
  ['A-04', 'Steam buffer target', '25 kg'],
  ['A-05', 'Receiver and boiler heat capacity', '1.15 MJ/K'],
  ['A-06', 'Condenser heat capacity', '2.50 MJ/K'],
  ['A-07', 'Condenser temperature law', 'Dynamic approach, 12 K base, bounded 35 to 75 °C'],
  ['A-08', 'Receiver treatment', 'Book’s lumped 0.67 efficiency; temperature is diagnostic'],
  ['A-09', 'Heliostat boost', 'Folded into aperture and optics; no extra multiplier'],
  ['A-10', 'Main pipe inside diameter', '50 mm'],
  ['A-11', 'Tesla valve stages', '11'],
  ['A-12', 'Valve forward loss coefficient', '6.0e9 Pa per (kg/s)²'],
  ['A-13', 'Unvalved bypass conductance', '6% of design flow when reversed'],
  ['A-14', 'Valve Reynolds correlation', 'Di 1 below Re 100, to 2 by Re 300, plateau 2'],
  ['A-15', 'Turbine rated speed', '3,000 rpm, capped 3,600 rpm'],
  ['A-16', 'Generator nameplate for capacity factor', '7 kW'],
  ['A-17', 'Tracking and controls parasitic', '0.027 kW while active'],
  ['A-18', 'Steam properties', 'Simplified IAPWS-style correlations, checked against the book’s cycle table'],
  ['A-19', 'Solar position', 'Fractional-year solar equations, checked at solar noon'],
  ['A-20', 'Weather interpolation', 'Hourly values held constant across each hour'],
  ['A-21', 'Initial condition', 'Cold start: liquid at ambient, no steam, no stored heat'],
  ['A-22', 'Water loss streams', 'Makeup, blowdown, samples, fugitives all zero (sealed boundary)'],
  ['A-23', 'Soiling, dust, degradation, freezing, wind', 'Excluded from version one'],
  ['A-24', 'Load control', 'The slider is a demand cap, not a household load profile'],
  ['A-25', 'Three-dimensional dimensions', 'Scaled from book areas and duties; casings are display defaults'],
  ['A-26', 'Day grouping', 'The dataset’s UTC dates'],
  ['A-27', 'Boiler standby loss', '0.0015 kW per K above ambient'],
  ['A-28', 'Pressure at design point', 'Follows the saturation curve to 4 MPa; surplus superheats the steam'],
  ['A-29', 'Boiler vessel volume', '1.6 m³'],
  ['A-30', 'Turbine admission gate', 'Stop valve opens at 240 °C and 3.5 MPa']
];
function renderAssumptions() {
  var html = '<table><tr><th>ID</th><th>Assumption</th><th>Default</th></tr>';
  ASSUMPTIONS.forEach(function (a) {
    html += '<tr><td>' + a[0] + '</td><td>' + a[1] + '</td><td>' + a[2] + '</td></tr>';
  });
  $('assumptions').innerHTML = html + '</table>';
}

/* ---------------- wiring ---------------- */
function selectPart(pid) {
  state.part = pid;
  document.querySelectorAll('#part-chips .chip').forEach(function (c) {
    c.classList.toggle('active', c.dataset.part === pid);
  });
  renderer.setIsolated(pid === 'all' ? null : pid);
  var s = currentStep();
  if (s) updatePartReadout(s);
}
function init() {
  renderer = ENE_GL.create($('gl'));
  if (!renderer) {
    $('clock-text').textContent = 'WebGL is not available in this browser.';
    return;
  }
  buildPhases();
  buildLabels();
  renderAssumptions();
  renderClaims();
  document.querySelectorAll('#part-chips .chip').forEach(function (c) {
    c.addEventListener('click', function () { selectPart(c.dataset.part); });
  });
  renderer.onPick(function (e) {
    var rect = $('gl').getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var s = currentStep();
    if (!s) return;
    // Recompute the view-projection quickly by rendering one frame's matrix:
    var out = renderer.render(s);
    if (!out || !out.vp) return;
    var best = null, bestD = 80;
    Object.keys(renderer.parts).forEach(function (pid) {
      if (pid === 'ground') return;
      var p = renderer.project(out.vp, renderer.parts[pid].anchor);
      var d = Math.hypot(p.x - mx * (rect.width / rect.width), p.y - my);
      // project() returns CSS pixels of the canvas box already.
      d = Math.hypot(p.x - mx, p.y - my);
      if (d < bestD) { bestD = d; best = pid; }
    });
    if (best) selectPart(best === 'loop' ? 'all' : best);
  });
  $('explode').addEventListener('input', function (e) {
    renderer.setExplode(parseFloat(e.target.value));
  });
  renderer.setExplode(0.35);
  $('pulse-btn').addEventListener('click', function () {
    renderer.pulse();
    var s = currentStep();
    var live = (s && s.turbine_flow_kg_h > 0.1)
      ? ' Right now the valve is working: flow ' + fmt(s.turbine_flow_kg_h, 1)
        + ' kg/h, Di ' + fmt(s.diodicity, 2) + '.'
      : ' The valve is idle at this hour, so its live Di reads 1.00.';
    $('pulse-note').textContent = 'Reverse push at the valve: in its working '
      + 'range the diodicity is about 2, so the reverse direction needs about '
      + 'twice the pressure for the same flow, and most of a reverse push '
      + 'recirculates in the loops instead of passing.' + live
      + ' This is a picture of the ratio, not a measurement.';
  });
  $('play-btn').addEventListener('click', function () {
    state.playing = !state.playing;
    $('play-btn').textContent = state.playing ? 'Pause' : 'Play';
  });
  $('speed').addEventListener('change', function (e) {
    state.speed = parseInt(e.target.value, 10);
  });
  $('scrub').addEventListener('input', function (e) {
    state.stepFloat = parseInt(e.target.value, 10);
  });
  $('date-input').addEventListener('change', function (e) {
    state.date = e.target.value;
    buildDay();
  });
  $('prev-day').addEventListener('click', function () { shiftDay(-1); });
  $('next-day').addEventListener('click', function () { shiftDay(1); });
  $('load').addEventListener('change', function (e) {
    state.loadCap = parseFloat(e.target.value);
    $('load-label').textContent = fmt(state.loadCap, 1) + ' kW';
    buildDay();
  });
  $('valve-orient').addEventListener('change', function (e) {
    state.valveReversed = e.target.value === 'reversed';
    buildDay();
  });
  // City UI
  var pc = $('preset-chips');
  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.className = 'chip';
    b.textContent = p.name + ' (' + p.kind + ')';
    b.addEventListener('click', function () {
      $('lat-input').value = p.lat;
      $('lon-input').value = p.lon;
      $('city-search').value = p.name;
    });
    pc.appendChild(b);
  });
  $('coords-btn').addEventListener('click', function () {
    $('city-search').value = '';
  });
  $('city-search-btn').addEventListener('click', function () {
    var q = $('city-search').value.trim();
    if (!q) return;
    $('city-results').textContent = 'Searching…';
    ENE_WX.geocode(q).then(function (results) {
      var host = $('city-results');
      host.innerHTML = '';
      if (!results.length) { host.textContent = 'No matches. Try coordinates.'; return; }
      results.forEach(function (r) {
        var b = document.createElement('button');
        b.className = 'chip';
        b.textContent = r.name + (r.admin1 ? ', ' + r.admin1 : '')
          + (r.country ? ', ' + r.country : '');
        b.addEventListener('click', function () {
          $('lat-input').value = r.latitude;
          $('lon-input').value = r.longitude;
          $('city-search').value = b.textContent;
          host.innerHTML = '';
        });
        host.appendChild(b);
      });
    }).catch(function () {
      $('city-results').textContent = 'Name search did not answer. Coordinates and presets still work.';
    });
  });
  $('fetch-btn').addEventListener('click', function () {
    var lat = parseFloat($('lat-input').value), lon = parseFloat($('lon-input').value);
    if (isNaN(lat) || isNaN(lon)) {
      $('fetch-status').textContent = 'Set a latitude and longitude first (a preset chip fills them in).';
      return;
    }
    var label = $('city-search').value.trim()
      || (fmt(lat, 3) + ', ' + fmt(lon, 3));
    var years = ENE_WX.completeYears(parseInt($('years-select').value, 10));
    if (state.dataset && state.dataset.bundled
        && Math.abs(lat - 33.046) < 0.01 && Math.abs(lon + 96.994) < 0.01
        && years.length === 1) {
      setDataset(state.dataset, state.analysis);
      return;
    }
    loadCity(lat, lon, label, years);
  });
  // Startup: bundled Lewisville year.
  progress(true, 0.2, 'Loading the bundled Lewisville year…');
  ENE_WX.loadBundled().then(function (ds) {
    state.cities[ds.label] = { dataset: ds, analysis: null };
    progress(true, 0.5, 'Bundled year loaded. Simulating 8,784 hours…');
    return ENE_WX.analyze(ds, state.loadCap, false, function (msg) {
      progress(true, 0.7, msg);
    }).then(function (analysis) {
      state.cities[ds.label].analysis = analysis;
      progress(false, 1, '');
      renderLoadedCities();
      setDataset(ds, analysis);
      window.ENE_READY = true;
    });
  }).catch(function (err) {
    progress(false, 0, '');
    $('fetch-status').textContent = 'The bundled dataset could not be loaded ('
      + err.message + '). Serve this folder over HTTP (as GitHub Pages does) '
      + 'or fetch a city above.';
  });
  requestAnimationFrame(frame);
}
function shiftDay(delta) {
  if (!state.date || !state.dataset) return;
  var nd = datePlus(state.date, delta);
  var first = state.dataset.rows[0][0].slice(0, 10);
  var lastD = state.dataset.rows[state.dataset.rows.length - 1][0].slice(0, 10);
  if (nd < first || nd > lastD) return;
  state.date = nd;
  $('date-input').value = nd;
  buildDay();
}

/* Demo and presentation hooks (used by the walkthrough capture). */
window.ENE_DEMO = {
  ready: function () { return !!window.ENE_READY; },
  setDate: function (d) { state.date = d; $('date-input').value = d; buildDay(); },
  getDate: function () { return state.date; },
  play: function () { state.playing = true; $('play-btn').textContent = 'Pause'; },
  pause: function () { state.playing = false; $('play-btn').textContent = 'Play'; },
  setSpeed: function (v) { state.speed = v; $('speed').value = String(v); },
  setTime: function (hours) { state.stepFloat = hours / 0.05; },
  isolate: function (pid) { selectPart(pid || 'all'); },
  setLoad: function (kw) { state.loadCap = kw; $('load').value = kw;
    $('load-label').textContent = fmt(kw, 1) + ' kW'; buildDay(); },
  title: function (on) { $('titlecard').hidden = !on; },
  caption: function (text) {
    var c = $('caption-bar');
    if (!text) { c.hidden = true; c.textContent = ''; }
    else { c.hidden = false; c.textContent = text; }
  },
  captionFixed: function (text) {
    var c = $('caption-fixed');
    if (!text) { c.hidden = true; c.textContent = ''; }
    else { c.hidden = false; c.textContent = text; }
  },
  pulse: function () { $('pulse-btn').click(); },
  setExplode: function (v) { $('explode').value = v; renderer.setExplode(v); },
  loadPreset: function (name) {
    var p = PRESETS.filter(function (x) { return x.name === name; })[0];
    if (!p) return Promise.reject(new Error('no preset ' + name));
    var years = ENE_WX.completeYears(1);
    return loadCity(p.lat, p.lon, p.name, years);
  },
  viewAnalysis: function () {
    document.getElementById('analysis-section').scrollIntoView();
  },
  viewBook: function () {
    document.getElementById('book-section').scrollIntoView();
  },
  viewTop: function () { window.scrollTo(0, 0); },
  analysisOf: function () { return state.analysis; }
};
document.addEventListener('DOMContentLoaded', init);
})();
