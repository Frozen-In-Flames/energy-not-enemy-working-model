/* Node CLI shim for the JS solver port: mirrors the C++ ene-model JSON. */
'use strict';
const fs = require('fs');
const ENE = require('../docs/solver.js');

function summaryJson(r, name, load, rev) {
  const dig = ENE.fnv1a64(ENE.summaryString(r, name, load, rev));
  const o = {
    scenario: name, load_kw: +load.toFixed(3), reversed: !!rev,
    hours: r.hours, solar_kwh: +r.total_solar_kwh.toFixed(4),
    heat_kwh: +r.total_heat_kwh.toFixed(4),
    gross_kwh: +r.total_gross_kwh.toFixed(4),
    net_kwh: +r.total_net_kwh.toFixed(4),
    condenser_kwh: +r.total_condenser_kwh.toFixed(4),
    peak_net_kw: +r.peak_net_kw.toFixed(4),
    water_start_kg: +r.water_start_kg.toFixed(4),
    water_end_kg: +r.water_end_kg.toFixed(4),
    water_delta_kg: +r.water_delta_kg.toFixed(6),
    balance_residual_kwh: +r.balance_residual_kwh.toFixed(4),
    digest: dig
  };
  console.log(JSON.stringify(o));
}

const cmd = process.argv[2];
const p = Object.assign({}, ENE.PARAMS);
if (cmd === 'cycle') {
  const ideal = ENE.rankineCycle(4.0, 400.0, 40.0, 1.0, 1.0);
  const real = ENE.rankineCycle(4.0, 400.0, 40.0, 0.75, 0.65);
  const pess = ENE.rankineCycle(4.0, 400.0, 40.0, 0.55, 0.50);
  console.log(JSON.stringify({
    ideal_eff: +ideal.efficiency.toFixed(4),
    realistic_eff: +real.efficiency.toFixed(4),
    pessimistic_eff: +pess.efficiency.toFixed(4),
    h3: +real.h3.toFixed(2), h4s: +real.h4s.toFixed(2),
    sat_t_at_1atm_c: +ENE.satTempC(0.101325).toFixed(3),
    sat_p_at_250c_mpa: +ENE.satPressureMpa(250.0).toFixed(4),
    di_at_re800: +ENE.valveDiodicity(800.0).toFixed(3)
  }));
} else if (cmd === 'scenario' || cmd === 'steps') {
  let name = process.argv[3];
  let rev = false, load = 5.0, days = 1, out = null;
  for (let i = 4; i < process.argv.length; i++) {
    if (process.argv[i] === '--reversed') rev = true;
    else if (process.argv[i] === '--load') load = parseFloat(process.argv[++i]);
    else if (process.argv[i] === '--days') days = parseInt(process.argv[++i], 10);
    else if (process.argv[i] === '--out') out = process.argv[++i];
  }
  if (name === 'reversed-valve') { name = 'summer-clear'; rev = true; }
  const w1 = ENE.scenarioWeather(name, p);
  let w = [];
  for (let d = 0; d < days; d++) w = w.concat(w1);
  const r = ENE.simulate(p, w, 0.05, load, rev, cmd === 'steps');
  if (cmd === 'steps' && out) {
    const cols = [['t_h','t_h'],['dni','dni_w_m2'],['ambient','ambient_c'],
      ['solar_kw','p_solar_kw'],['heat_kw','p_heat_kw'],['boiler_c','boiler_temp_c'],
      ['pressure_mpa','boiler_pressure_mpa'],['steam_kg','steam_kg'],
      ['turbine_kg_h','turbine_flow_kg_h'],['shaft_kw','p_shaft_kw'],['rpm','rpm'],
      ['gross_kw','p_gross_kw'],['net_kw','p_net_kw'],
      ['condenser_c','condenser_temp_c'],['condenser_kw','p_condenser_kw'],
      ['boiler_kg','boiler_kg'],['exhaust_kg','exhaust_kg'],
      ['condenser_kg','condenser_kg'],['cum_net_kwh','cum_net_kwh'],
      ['balance_residual_kwh','balance_residual_kwh']];
    let txt = cols.map(c => c[0]).join(',') + '\n';
    for (const s of r.steps) txt += cols.map(c => s[c[1]]).join(',') + '\n';
    fs.writeFileSync(out, txt);
  }
  summaryJson(r, name, load, rev);
} else if (cmd === 'csv') {
  const path = process.argv[3];
  let load = 5.0, dt = 0.25;
  for (let i = 4; i < process.argv.length; i++) {
    if (process.argv[i] === '--load') load = parseFloat(process.argv[++i]);
    else if (process.argv[i] === '--dt') dt = parseFloat(process.argv[++i]);
  }
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
  const w = lines.map(l => { const c = l.split(','); return [parseFloat(c[1]), parseFloat(c[2])]; });
  const r = ENE.simulate(p, w, dt, load, false, false);
  summaryJson(r, 'csv:' + path, load, false);
} else {
  console.error('unknown command');
  process.exit(2);
}
