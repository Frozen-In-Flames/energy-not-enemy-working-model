/* Energy Not Enemy: The Working Model, JavaScript solver port.
 * Hand-written port of the C++ solver core (src/model.cpp); no libraries.
 * The parity battery (tests/run_battery.py) runs the same scenarios through
 * C++, the Python oracle, and this port and reports agreement.
 * Works in the browser (window.ENE) and in Node (module.exports). */
(function (global) {
'use strict';
var PI = Math.PI;

var PARAMS = {
  aperture_m2: 40.0, concentration: 60.0, optical_eff: 0.75, receiver_eff: 0.67,
  design_pressure_mpa: 4.0, design_superheat_c: 400.0, turbine_eff: 0.75,
  pump_eff: 0.65, generator_eff: 0.95, condenser_area_m2: 51.0, condenser_u: 8.0,
  nameplate_kw: 7.0, total_water_kg: 250.0, boiler_water_kg: 180.0,
  steam_target_kg: 25.0, pipe_id_m: 0.050, valve_stages: 11.0,
  valve_k_fwd: 6.0e9, bypass_fraction: 0.06, rated_rpm: 3000.0, max_rpm: 3600.0,
  parasitic_base_kw: 0.027, boiler_loss_kw_per_k: 0.0015, vessel_volume_m3: 1.6,
  latitude: 33.046, longitude: -96.994, start_day_of_year: 1
};

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function liquidEnthalpy(t) { return 4.05 * t + 0.0011 * t * t; }
function latentHeat(t) { return 2501.0 - 1.83 * t - 0.0062 * t * t + 0.000004 * t * t * t; }
function vaporEnthalpy(t) { return liquidEnthalpy(t) + latentHeat(t); }
function liquidEntropy(t) { return 4.186 * Math.log((t + 273.15) / 273.15); }
function vaporEntropy(t) { return liquidEntropy(t) + latentHeat(t) / (t + 273.15); }

function satPressureMpa(t) {
  if (t <= 0.0) t = 0.01;
  if (t < 100.0) return 0.005893 * Math.exp(17.502 * t / (240.97 + t)) * 0.101325;
  var hfgAvg = 0.5 * (latentHeat(100.0) + latentHeat(t));
  var lnP = -(hfgAvg / 0.4615) * (1.0 / (t + 273.15) - 1.0 / 373.15);
  var x = t - 100.0;
  lnP += 0.0011 * x + 0.000008 * x * x;
  return Math.exp(lnP) * 0.101325;
}
function satTempC(p) {
  var lo = 0.01, hi = 373.9;
  if (p <= satPressureMpa(lo)) return lo;
  if (p >= satPressureMpa(hi)) return hi;
  for (var i = 0; i < 80; i++) {
    var mid = 0.5 * (lo + hi);
    if (satPressureMpa(mid) < p) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}
function steamEnthalpy(p, t) {
  var ts = satTempC(p);
  return t <= ts ? vaporEnthalpy(ts) : vaporEnthalpy(ts) + 2.1 * (t - ts);
}
function steamEntropy(p, t) {
  var ts = satTempC(p);
  return t <= ts ? vaporEntropy(ts)
                 : vaporEntropy(ts) + 2.1 * Math.log((t + 273.15) / (ts + 273.15));
}
function valveDiodicity(re) {
  if (re <= 100.0) return 1.0;
  if (re >= 300.0) return 2.0;
  return 1.0 + (re - 100.0) / 200.0;
}

function solarPosition(doy, utcHour, latDeg, lonDeg) {
  var gamma = 2.0 * PI / 365.0 * (doy - 1 + (utcHour - 12.0) / 24.0);
  var eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma));
  var decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  var tst = utcHour * 60.0 + eqtime + 4.0 * lonDeg;
  while (tst < 0) tst += 1440.0;
  while (tst >= 1440.0) tst -= 1440.0;
  var haDeg = tst / 4.0 - 180.0;
  if (haDeg < -180.0) haDeg += 360.0;
  var ha = haDeg * PI / 180.0, lat = latDeg * PI / 180.0;
  var cosz = clamp(Math.sin(lat) * Math.sin(decl)
    + Math.cos(lat) * Math.cos(decl) * Math.cos(ha), -1.0, 1.0);
  var elev = 90.0 - Math.acos(cosz) * 180.0 / PI;
  var az = Math.atan2(Math.sin(ha),
    Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
  return { elevation_deg: elev, azimuth_deg: az * 180.0 / PI + 180.0,
           declination_deg: decl * 180.0 / PI, equation_time_min: eqtime };
}

function rankineCycle(pMpa, tSuper, condC, etaT, etaP) {
  var pCond = satPressureMpa(condC);
  var h1 = liquidEnthalpy(condC);
  var pumpWork = 0.001008 * (pMpa - pCond) * 1000.0 / etaP;
  var h2 = h1 + pumpWork;
  var h3 = steamEnthalpy(pMpa, tSuper);
  var s3 = steamEntropy(pMpa, tSuper);
  var sf = liquidEntropy(condC), sg = vaporEntropy(condC);
  var x = clamp((s3 - sf) / (sg - sf), 0.0, 1.0);
  var h4s = liquidEnthalpy(condC) + x * latentHeat(condC);
  var turbWork = etaT * (h3 - h4s);
  return { h1: h1, h2: h2, h3: h3, h4s: h4s, h4: h3 - turbWork,
           pump_work: pumpWork, turbine_work: turbWork, heat_in: h3 - h2,
           efficiency: (turbWork - pumpWork) / (h3 - h2) };
}

/* hourly: array of [dni_w_m2, ambient_c], one entry per hour. */
function simulate(p, hourly, dtH, loadCapKw, valveReversed, collectSteps) {
  var totalH = hourly.length;
  var waterStart = p.total_water_kg;
  var ambient0 = hourly.length ? hourly[0][1] : 20.0;
  var boilerKg = p.boiler_water_kg, steamKg = 0.0, exhaustKg = 0.0;
  var condenserKg = p.total_water_kg - p.boiler_water_kg;
  var boilerTemp = ambient0;
  var pressure = satPressureMpa(Math.max(0.5, boilerTemp));
  var condTemp = clamp(ambient0 + 12.0, 35.0, 75.0);
  var boilerEnergyMj = boilerKg * liquidEnthalpy(boilerTemp) / 1000.0;
  var boilerEnergy0Mj = boilerEnergyMj;
  var condBacklogKwh = 0.0;
  var transit0Kwh = condenserKg * liquidEnthalpy(condTemp) / 3600.0;
  var rpm = 0.0;
  var cumSolar = 0, cumOpt = 0, cumHeat = 0, cumEnth = 0, cumShaft = 0,
      cumGross = 0, cumNet = 0, cumCond = 0, cumOptLoss = 0, cumRecLoss = 0,
      cumStandby = 0;
  var peakNet = 0, peakGross = 0;
  var steps = [], last = null;
  var nsteps = Math.ceil(totalH / dtH - 1e-9);

  function steamVol(tc, mass) {
    var rho = satPressureMpa(tc) * 1000.0 / (0.4615 * (tc + 273.15));
    var vf = 0.001 + 4.0e-9 * tc * tc;
    return clamp(rho * (p.vessel_volume_m3 - mass * vf) / (1.0 - rho * vf), 0.0, mass);
  }
  function eModel(tc) {
    var s = steamVol(tc, boilerKg);
    return ((boilerKg - s) * liquidEnthalpy(tc) + s * vaporEnthalpy(tc)) / 1000.0;
  }

  for (var i = 0; i < nsteps; i++) {
    var t = i * dtH;
    var hi = Math.min(Math.floor(t + 1e-9), hourly.length - 1);
    var w = hourly[Math.max(0, hi)];
    var doy = p.start_day_of_year + Math.floor(t / 24.0);
    var utcHour = t - 24.0 * Math.floor(t / 24.0);
    var sun = solarPosition(doy, utcHour, p.latitude, p.longitude);
    var dni = sun.elevation_deg > 0.0 ? w[0] : 0.0;
    var ambient = w[1];

    var pSolar = dni * p.aperture_m2 / 1000.0;
    var pOpt = pSolar * p.optical_eff;
    var pHeat = pOpt * p.receiver_eff;
    cumSolar += pSolar * dtH; cumOpt += pOpt * dtH; cumHeat += pHeat * dtH;
    cumOptLoss += (pSolar - pOpt) * dtH; cumRecLoss += (pOpt - pHeat) * dtH;

    var tsat = satTempC(pressure);
    var superheat = Math.max(0.0, boilerTemp - tsat);
    var recBoilerTemp = boilerTemp, recPressure = pressure;
    var condP = satPressureMpa(condTemp);
    var hBoiler = steamKg > 0.5 ? steamEnthalpy(pressure, boilerTemp)
                                : liquidEnthalpy(boilerTemp);
    var sBoiler = steamEntropy(pressure, Math.max(boilerTemp, tsat));
    var ratedFlowKgs = 0.00886;
    var turbFlow = 0, bypassFlow = 0, pShaft = 0, pPump = 0, valveDp = 0;
    var inletP = pressure, enthDrop = 0, reynolds = 0, diod = 1.0;
    var canRun = loadCapKw > 0.0 && boilerTemp >= 240.0 && steamKg > 0.05
                 && pressure >= 3.5;
    if (canRun) {
      var dpAvail = Math.max(0.0, pressure - condP) * 1.0e6;
      var kEff = p.valve_k_fwd * (valveReversed ? 2.0 : 1.0);
      var capFlow = Math.sqrt(dpAvail / kEff);
      var sf = liquidEntropy(condTemp), sg = vaporEntropy(condTemp);
      var specificWork = function (sIn) {
        var x = clamp((sIn - sf) / (sg - sf), 0.0, 1.0);
        var h4s = liquidEnthalpy(condTemp) + x * latentHeat(condTemp);
        return p.turbine_eff * (hBoiler - h4s);
      };
      var wFull = specificWork(sBoiler);
      if (wFull > 1.0) {
        var denom = wFull * p.generator_eff / 3600.0;
        var flowReq = denom > 0 ? loadCapKw / denom : 0.0;
        var flowKgs = Math.min(flowReq / 3600.0, capFlow);
        valveDp = kEff * flowKgs * flowKgs;
        inletP = Math.max(condP, pressure - valveDp / 1.0e6);
        var sIn = sBoiler + 0.4615 * Math.log(Math.max(1.0, pressure / Math.max(inletP, 1e-9)));
        var wActual = specificWork(sIn);
        if (wActual > 1.0 && flowKgs > 0.0) {
          turbFlow = flowKgs * 3600.0;
          enthDrop = wActual;
          pShaft = turbFlow * wActual / 3600.0;
          var pumpIdeal = 0.001008 * (pressure - condP) * 1000.0;
          pPump = turbFlow * (pumpIdeal / p.pump_eff) / 3600.0;
        }
      }
      var area = PI * p.pipe_id_m * p.pipe_id_m / 4.0;
      var vel = (turbFlow / 3600.0) / (1000.0 * area);
      reynolds = 1000.0 * vel * p.pipe_id_m / 0.00028;
      diod = valveDiodicity(reynolds);
      if (valveReversed) {
        var dpDesign = (p.design_pressure_mpa - satPressureMpa(40.0)) * 1.0e6;
        bypassFlow = p.bypass_fraction * ratedFlowKgs * 3600.0
          * Math.sqrt(Math.max(0.0, (pressure - condP) * 1.0e6) / dpDesign);
      }
    }
    var pGross = pShaft * p.generator_eff;
    var pPar = 0, pNet = 0;
    if (pGross > 0.0) {
      pPar = pPump + p.parasitic_base_kw;
      pNet = Math.max(0.0, pGross - pPar);
    }
    var targetRpm = (turbFlow > 0.0 && pShaft > 0.0)
      ? Math.min(p.max_rpm, p.rated_rpm * (pShaft / 5.0)) : 0.0;
    rpm += (targetRpm - rpm) * (1.0 - Math.exp(-6.0 * dtH));
    if (turbFlow <= 0.0 && rpm < 1.0) rpm = 0.0;
    cumEnth += turbFlow * hBoiler / 3600.0 * dtH;
    cumShaft += pShaft * dtH; cumGross += pGross * dtH; cumNet += pNet * dtH;
    peakNet = Math.max(peakNet, pNet); peakGross = Math.max(peakGross, pGross);

    var outKg = (turbFlow + bypassFlow) * dtH;
    var hExhaust = liquidEnthalpy(condTemp);
    var exhaustEnergy = 0.0;
    if (turbFlow > 0.0)
      exhaustEnergy += turbFlow * dtH * ((hBoiler - enthDrop) - hExhaust) / 3600.0;
    if (bypassFlow > 0.0)
      exhaustEnergy += bypassFlow * dtH * (hBoiler - hExhaust) / 3600.0;
    exhaustKg += outKg;
    condBacklogKwh += Math.max(0.0, exhaustEnergy);
    var ua = p.condenser_u * p.condenser_area_m2 / 1000.0;
    var pReject = Math.min(ua * Math.max(0.0, condTemp - ambient),
                           condBacklogKwh / dtH);
    var removed = pReject * dtH;
    var frac = condBacklogKwh > 1e-12 ? removed / condBacklogKwh : 0.0;
    var condensedKg = exhaustKg * frac;
    condBacklogKwh -= removed;
    exhaustKg -= condensedKg;
    condenserKg += condensedKg;
    cumCond += removed;

    var returnKg = 0.0;
    if (turbFlow > 0.0) returnKg = Math.min(condenserKg, turbFlow * dtH);
    else if (condenserKg > 0.0 && boilerKg < p.boiler_water_kg)
      returnKg = Math.min(condenserKg, 15.0 * dtH, p.boiler_water_kg - boilerKg);
    condenserKg -= returnKg;

    var standbyKw = p.boiler_loss_kw_per_k * Math.max(0.0, boilerTemp - ambient);
    cumStandby += standbyKw * dtH;
    boilerEnergyMj -= outKg * hBoiler / 1000.0;
    boilerEnergyMj += returnKg * liquidEnthalpy(condTemp) / 1000.0;
    boilerEnergyMj += pHeat * dtH * 3.6;
    boilerEnergyMj -= standbyKw * dtH * 3.6;
    if (boilerEnergyMj < 0.0) boilerEnergyMj = 0.0;
    boilerKg = boilerKg - outKg + returnKg;

    var tDesignSat = satTempC(p.design_pressure_mpa);
    var eSwitch = eModel(tDesignSat);
    if (boilerKg <= 0.0) {
      steamKg = 0.0; boilerTemp = ambient; pressure = satPressureMpa(0.5);
    } else if (boilerEnergyMj <= eSwitch) {
      var lo = 0.0, hi2 = tDesignSat;
      for (var it = 0; it < 60; it++) {
        var mid = 0.5 * (lo + hi2);
        if (eModel(mid) < boilerEnergyMj) lo = mid; else hi2 = mid;
      }
      boilerTemp = 0.5 * (lo + hi2);
      steamKg = steamVol(boilerTemp, boilerKg);
      pressure = satPressureMpa(Math.max(0.5, boilerTemp));
    } else {
      var sSw = steamVol(tDesignSat, boilerKg);
      steamKg = sSw;
      pressure = p.design_pressure_mpa;
      var extraKj = (boilerEnergyMj - eSwitch) * 1000.0;
      boilerTemp = tDesignSat + extraKj / Math.max(1.0, sSw * 2.1);
      if (boilerTemp > 450.0) {
        var keptKj = (450.0 - tDesignSat) * sSw * 2.1;
        cumStandby += (extraKj - keptKj) / 3600.0;
        boilerEnergyMj = eSwitch + keptKj / 1000.0;
        boilerTemp = 450.0;
      }
    }

    var loadEffect = clamp(condBacklogKwh * 2.0, 0.0, 25.0);
    var condTarget = clamp(ambient + 12.0 + loadEffect, 35.0, 75.0);
    condTemp += (condTarget - condTemp) * (1.0 - Math.exp(-2.0 * dtH));

    var transitKwh = (exhaustKg + condenserKg) * liquidEnthalpy(condTemp) / 3600.0;
    var stored = (boilerEnergyMj - boilerEnergy0Mj) / 3.6 + condBacklogKwh
                 + transitKwh - transit0Kwh;
    var residual = cumSolar - (cumOptLoss + cumRecLoss + cumGross + cumCond
                               + cumStandby + stored);
    last = {
      t_h: t, dni_w_m2: dni, ambient_c: ambient,
      solar_elev_deg: sun.elevation_deg, solar_azim_deg: sun.azimuth_deg,
      p_solar_kw: pSolar, p_optical_kw: pOpt, p_heat_kw: pHeat,
      receiver_temp_c: recBoilerTemp + (dni > 0 ? Math.min(80.0, pHeat * 8.0) : 0.0),
      boiler_temp_c: recBoilerTemp, boiler_pressure_mpa: recPressure,
      sat_temp_c: tsat, superheat_c: superheat, steam_kg: steamKg,
      boiler_kg: boilerKg, exhaust_kg: exhaustKg, condenser_kg: condenserKg,
      total_water_kg: boilerKg + exhaustKg + condenserKg,
      boiler_enthalpy_flow_kw: turbFlow * hBoiler / 3600.0,
      reynolds: reynolds, diodicity: diod, valve_dp_pa: valveDp,
      turbine_flow_kg_h: turbFlow, bypass_flow_kg_h: bypassFlow,
      reverse_leak_kg_h: bypassFlow,
      flow_direction: turbFlow > 0.0 ? 1
        : ((returnKg > 0.0 || condensedKg > 0.0) ? -1 : 0),
      turbine_inlet_mpa: inletP, enthalpy_drop_kj_kg: enthDrop,
      p_shaft_kw: pShaft, rpm: rpm, p_gross_kw: pGross, p_pump_kw: pPump,
      p_parasitic_kw: pPar, p_net_kw: pNet, condenser_temp_c: condTemp,
      p_condenser_kw: pReject, condensed_kg_h: condensedKg / dtH,
      return_kg_h: returnKg / dtH,
      cum_solar_kwh: cumSolar, cum_optical_kwh: cumOpt, cum_heat_kwh: cumHeat,
      cum_enthalpy_kwh: cumEnth, cum_shaft_kwh: cumShaft,
      cum_gross_kwh: cumGross, cum_net_kwh: cumNet,
      cum_condenser_kwh: cumCond, cum_optical_loss_kwh: cumOptLoss,
      cum_receiver_loss_kwh: cumRecLoss, cum_standby_loss_kwh: cumStandby,
      stored_kwh: stored, balance_residual_kwh: residual
    };
    if (collectSteps) steps.push(last);
  }
  return {
    hours: totalH, total_solar_kwh: cumSolar, total_heat_kwh: cumHeat,
    total_gross_kwh: cumGross, total_net_kwh: cumNet,
    total_condenser_kwh: cumCond, peak_net_kw: peakNet,
    peak_gross_kw: peakGross, water_start_kg: waterStart,
    water_end_kg: last ? last.total_water_kg : waterStart,
    water_delta_kg: (last ? last.total_water_kg : waterStart) - waterStart,
    balance_residual_kwh: last ? last.balance_residual_kwh : 0.0,
    steps: steps
  };
}

function scenarioWeather(name, p) {
  var i;
  if (name === 'night-only' || name === 'zero-control') {
    p.start_day_of_year = 172;
    var w0 = [];
    for (i = 0; i < 24; i++) w0.push([0.0, 15.0]);
    return w0;
  }
  var doy = 172, peak = 950.0, expo = 1.15, mean = 31.0, amp = 5.0;
  if (name === 'winter-clear') { doy = 355; peak = 520.0; expo = 1.20; mean = 8.0; amp = 6.0; }
  if (name === 'book-design-day') { doy = 135; peak = 950.0; expo = 1.15; mean = 28.0; amp = 5.0; }
  p.start_day_of_year = doy;
  var declDeg = -23.44 * Math.cos(2.0 * PI * (doy + 10) / 365.0);
  var lat = p.latitude * PI / 180.0, decl = declDeg * PI / 180.0;
  var cosH = clamp(-Math.tan(lat) * Math.tan(decl), -1.0, 1.0);
  var daylen = 2.0 * Math.acos(cosH) * 180.0 / PI / 15.0;
  var sunrise = 12.0 - daylen / 2.0;
  var raw = [], amb = [], w = [];
  for (i = 0; i < 24; i++) {
    var sp = solarPosition(doy, i + 0.5, p.latitude, p.longitude);
    var lst = i + 0.5 + p.longitude / 15.0 + sp.equation_time_min / 60.0;
    while (lst < sunrise - 12.0) lst += 24.0;
    while (lst >= sunrise + 12.0) lst -= 24.0;
    var shape = Math.sin(PI * (lst - sunrise) / daylen);
    raw.push(shape > 0 ? Math.pow(shape, expo) : 0.0);
    amb.push(mean - amp * Math.cos(2.0 * PI * (lst - 15.0) / 24.0));
  }
  if (name === 'book-design-day') {
    var sum = 0;
    for (i = 0; i < 24; i++) sum += raw[i];
    var scale = 5500.0 / sum;
    for (i = 0; i < 24; i++) w.push([raw[i] * scale, amb[i]]);
    return w;
  }
  for (i = 0; i < 24; i++) w.push([raw[i] * peak, amb[i]]);
  return w;
}

function fnv1a64(s) {
  var h = 1469598103934665603n;
  var prime = 1099511628211n, mask = (1n << 64n) - 1n;
  for (var i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i) & 0xff);
    h = (h * prime) & mask;
  }
  var hex = h.toString(16);
  while (hex.length < 16) hex = '0' + hex;
  return hex;
}
function summaryString(r, scenario, load, rev) {
  function f(x, n) { return x.toFixed(n); }
  return scenario + '|load=' + f(load, 3) + '|rev=' + (rev ? 1 : 0)
    + '|hours=' + f(r.hours, 2) + '|solar=' + f(r.total_solar_kwh, 4)
    + '|heat=' + f(r.total_heat_kwh, 4) + '|gross=' + f(r.total_gross_kwh, 4)
    + '|net=' + f(r.total_net_kwh, 4) + '|cond=' + f(r.total_condenser_kwh, 4)
    + '|peaknet=' + f(r.peak_net_kw, 4) + '|water=' + f(r.water_start_kg, 4)
    + '->' + f(r.water_end_kg, 4) + '|resid=' + f(r.balance_residual_kwh, 4);
}

var ENE = {
  PARAMS: PARAMS, clamp: clamp, liquidEnthalpy: liquidEnthalpy,
  latentHeat: latentHeat, vaporEnthalpy: vaporEnthalpy,
  liquidEntropy: liquidEntropy, vaporEntropy: vaporEntropy,
  satPressureMpa: satPressureMpa, satTempC: satTempC,
  steamEnthalpy: steamEnthalpy, steamEntropy: steamEntropy,
  valveDiodicity: valveDiodicity, solarPosition: solarPosition,
  rankineCycle: rankineCycle, simulate: simulate,
  scenarioWeather: scenarioWeather, fnv1a64: fnv1a64,
  summaryString: summaryString
};
global.ENE = ENE;
if (typeof module !== 'undefined' && module.exports) module.exports = ENE;
})(typeof window !== 'undefined' ? window : globalThis);
