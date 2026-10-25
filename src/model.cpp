#include "model.h"
#include <cmath>
#include <algorithm>
#include <cstdio>

namespace ene {
static const double PI = 3.14159265358979323846;
static double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ---- Saturation pressure: piecewise correlation anchored at 100 C = 1 atm.
// Below 100 C a Magnus-form expression calibrated so Psat(100 C) = 1 atm
// exactly; above 100 C a Clausius-Clapeyron integral of the model's own
// latent-heat curve with a small fitted non-ideality correction.
double sat_pressure_mpa(double t_c) {
  if (t_c <= 0.0) t_c = 0.01;
  if (t_c < 100.0) {
    double atm = 0.005893 * std::exp(17.502 * t_c / (240.97 + t_c));
    return atm * 0.101325;
  }
  double tk = t_c + 273.15, tk0 = 373.15;
  double hfg_avg = 0.5 * (latent_heat_kj_kg(100.0) + latent_heat_kj_kg(t_c));
  double ln_p = -(hfg_avg / 0.4615) * (1.0 / tk - 1.0 / tk0);
  double x = t_c - 100.0;
  ln_p += 0.0011 * x + 0.000008 * x * x;
  return std::exp(ln_p) * 0.101325;
}

double sat_temp_c(double p_mpa) {
  double lo = 0.01, hi = 373.9;
  if (p_mpa <= sat_pressure_mpa(lo)) return lo;
  if (p_mpa >= sat_pressure_mpa(hi)) return hi;
  for (int i = 0; i < 80; ++i) {
    double mid = 0.5 * (lo + hi);
    if (sat_pressure_mpa(mid) < p_mpa) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

double liquid_enthalpy_kj_kg(double t_c) { return 4.05 * t_c + 0.0011 * t_c * t_c; }
double latent_heat_kj_kg(double t_c) {
  return 2501.0 - 1.83 * t_c - 0.0062 * t_c * t_c + 0.000004 * t_c * t_c * t_c;
}
double vapor_enthalpy_kj_kg(double t_c) { return liquid_enthalpy_kj_kg(t_c) + latent_heat_kj_kg(t_c); }
double liquid_entropy_kj_kgk(double t_c) { return 4.186 * std::log((t_c + 273.15) / 273.15); }
double vapor_entropy_kj_kgk(double t_c) {
  return liquid_entropy_kj_kgk(t_c) + latent_heat_kj_kg(t_c) / (t_c + 273.15);
}

double steam_enthalpy_kj_kg(double p_mpa, double t_c) {
  double ts = sat_temp_c(p_mpa);
  if (t_c <= ts) return vapor_enthalpy_kj_kg(ts);
  return vapor_enthalpy_kj_kg(ts) + 2.1 * (t_c - ts);
}
double steam_entropy_kj_kgk(double p_mpa, double t_c) {
  double ts = sat_temp_c(p_mpa);
  if (t_c <= ts) return vapor_entropy_kj_kgk(ts);
  return vapor_entropy_kj_kgk(ts) + 2.1 * std::log((t_c + 273.15) / (ts + 273.15));
}

double valve_diodicity(double re) {
  if (re <= 100.0) return 1.0;
  if (re >= 300.0) return 2.0;
  return 1.0 + (re - 100.0) / 200.0;
}

SolarPos solar_position(int doy, double utc_hour, double lat_deg, double lon_deg) {
  double gamma = 2.0 * PI / 365.0 * (doy - 1 + (utc_hour - 12.0) / 24.0);
  SolarPos s;
  s.equation_time_min = 229.18 * (0.000075 + 0.001868 * std::cos(gamma) - 0.032077 * std::sin(gamma)
                        - 0.014615 * std::cos(2 * gamma) - 0.040849 * std::sin(2 * gamma));
  double decl = 0.006918 - 0.399912 * std::cos(gamma) + 0.070257 * std::sin(gamma)
              - 0.006758 * std::cos(2 * gamma) + 0.000907 * std::sin(2 * gamma)
              - 0.002697 * std::cos(3 * gamma) + 0.00148 * std::sin(3 * gamma);
  s.declination_deg = decl * 180.0 / PI;
  double tst = utc_hour * 60.0 + s.equation_time_min + 4.0 * lon_deg;
  while (tst < 0) tst += 1440.0;
  while (tst >= 1440.0) tst -= 1440.0;
  double ha_deg = tst / 4.0 - 180.0;
  if (ha_deg < -180.0) ha_deg += 360.0;
  double ha = ha_deg * PI / 180.0, lat = lat_deg * PI / 180.0;
  double cosz = std::sin(lat) * std::sin(decl) + std::cos(lat) * std::cos(decl) * std::cos(ha);
  cosz = clampd(cosz, -1.0, 1.0);
  double zen = std::acos(cosz);
  s.elevation_deg = 90.0 - zen * 180.0 / PI;
  double az = std::atan2(std::sin(ha), std::cos(ha) * std::sin(lat) - std::tan(decl) * std::cos(lat));
  s.azimuth_deg = az * 180.0 / PI + 180.0;
  return s;
}

CyclePoint rankine_cycle(double p_mpa, double t_super_c, double cond_c,
                         double eta_t, double eta_p) {
  CyclePoint c;
  double p_cond = sat_pressure_mpa(cond_c);
  c.h1 = liquid_enthalpy_kj_kg(cond_c);
  double v_f = 0.001008; // m3/kg liquid specific volume (stated constant)
  double pump_ideal = v_f * (p_mpa - p_cond) * 1000.0; // kJ/kg
  c.pump_work_kj_kg = pump_ideal / eta_p;
  c.h2 = c.h1 + c.pump_work_kj_kg;
  c.h3 = steam_enthalpy_kj_kg(p_mpa, t_super_c);
  double s3 = steam_entropy_kj_kgk(p_mpa, t_super_c);
  double sf = liquid_entropy_kj_kgk(cond_c), sg = vapor_entropy_kj_kgk(cond_c);
  double x = clampd((s3 - sf) / (sg - sf), 0.0, 1.0);
  c.h4s = liquid_enthalpy_kj_kg(cond_c) + x * latent_heat_kj_kg(cond_c);
  c.turbine_work_kj_kg = eta_t * (c.h3 - c.h4s);
  c.h4 = c.h3 - c.turbine_work_kj_kg;
  c.heat_in_kj_kg = c.h3 - c.h2;
  c.efficiency = (c.turbine_work_kj_kg - c.pump_work_kj_kg) / c.heat_in_kj_kg;
  return c;
}

std::string fnv1a64(const std::string& s) {
  unsigned long long h = 1469598103934665603ULL;
  for (unsigned char ch : s) { h ^= ch; h *= 1099511628211ULL; }
  char buf[32]; std::snprintf(buf, sizeof buf, "%016llx", h);
  return std::string(buf);
}

SimResult simulate(const Params& p, const std::vector<WeatherStep>& hourly,
                   double dt_h, double load_cap_kw, bool valve_reversed,
                   bool collect_steps) {
  SimResult r;
  const double total_h = (double)hourly.size();
  r.hours = total_h;
  r.water_start_kg = p.total_water_kg;

  // Initial state (A-21): liquid at first-step ambient, no steam.
  double ambient0 = hourly.empty() ? 20.0 : hourly[0].ambient_c;
  double boiler_kg = p.boiler_water_kg;
  double steam_kg = 0.0;
  double exhaust_kg = 0.0;
  double condenser_kg = p.total_water_kg - p.boiler_water_kg;
  double boiler_temp = ambient0;
  double pressure = sat_pressure_mpa(std::max(0.5, boiler_temp));
  double cond_temp = clampd(ambient0 + 12.0, 35.0, 75.0);
  // Boiler thermal content on an enthalpy basis (MJ), consistent with the
  // boundary enthalpy fluxes so the energy ledger closes by construction.
  double boiler_energy_mj = boiler_kg * liquid_enthalpy_kj_kg(boiler_temp) / 1000.0;
  const double boiler_energy0_mj = boiler_energy_mj;
  double cond_backlog_kwh = 0.0; // exhaust enthalpy waiting to be rejected
  // Liquid held outside the boiler carries enthalpy at condenser temperature;
  // it is part of stored energy in the ledger.
  const double transit0_kwh = condenser_kg * liquid_enthalpy_kj_kg(cond_temp) / 3600.0;
  double rpm = 0.0;

  double cum_solar = 0, cum_opt = 0, cum_heat = 0, cum_enth = 0, cum_shaft = 0;
  double cum_gross = 0, cum_net = 0, cum_cond = 0, cum_opt_loss = 0, cum_rec_loss = 0;
  double cum_standby = 0;

  const int nsteps = (int)std::ceil(total_h / dt_h - 1e-9);
  for (int i = 0; i < nsteps; ++i) {
    double t = i * dt_h;
    int hi = std::min((int)std::floor(t + 1e-9), (int)hourly.size() - 1);
    const WeatherStep& w = hourly[std::max(0, hi)];
    // Day of year / UTC hour from elapsed time (period starts Jan 1 00 UTC
    // for annual runs; scenario runs pass a single day repeated by caller
    // convention starting at their stated date offset in t via hour index).
    int doy = p.start_day_of_year + (int)std::floor(t / 24.0);
    double utc_hour = t - 24.0 * std::floor(t / 24.0);
    SolarPos sun = solar_position(doy, utc_hour, p.latitude, p.longitude);
    double dni = (sun.elevation_deg > 0.0) ? w.dni_w_m2 : 0.0;
    double ambient = w.ambient_c;

    StepRecord rec;
    rec.t_h = t; rec.dni_w_m2 = dni; rec.ambient_c = ambient;
    rec.solar_elev_deg = sun.elevation_deg; rec.solar_azim_deg = sun.azimuth_deg;

    double p_solar = dni * p.aperture_m2 / 1000.0;
    double p_opt = p_solar * p.optical_eff;
    double p_heat = p_opt * p.receiver_eff;
    rec.p_solar_kw = p_solar; rec.p_optical_kw = p_opt; rec.p_heat_kw = p_heat;
    cum_solar += p_solar * dt_h; cum_opt += p_opt * dt_h; cum_heat += p_heat * dt_h;
    cum_opt_loss += (p_solar - p_opt) * dt_h; cum_rec_loss += (p_opt - p_heat) * dt_h;

    double tsat = sat_temp_c(pressure);
    double superheat = std::max(0.0, boiler_temp - tsat);
    rec.sat_temp_c = tsat; rec.superheat_c = superheat;
    rec.boiler_temp_c = boiler_temp; rec.boiler_pressure_mpa = pressure;
    rec.receiver_temp_c = boiler_temp + (dni > 0 ? std::min(80.0, p_heat * 8.0) : 0.0);
    rec.condenser_temp_c = cond_temp;

    // --- Turbine / valve, using the state at the start of the step.
    double cond_p = sat_pressure_mpa(cond_temp);
    double h_boiler = (steam_kg > 0.5) ? steam_enthalpy_kj_kg(pressure, boiler_temp)
                                       : liquid_enthalpy_kj_kg(boiler_temp);
    double s_boiler = steam_entropy_kj_kgk(pressure, std::max(boiler_temp, tsat));
    double rated_flow_kgs = 0.00886; // ~7 kW at design specific work (A-16 basis)
    double turb_flow = 0.0, bypass_flow = 0.0, p_shaft = 0.0, p_pump = 0.0;
    double valve_dp = 0.0, inlet_p = pressure, enth_drop = 0.0, reynolds = 0.0, diod = 1.0;
    // Admission gate (A-30): the stop valve opens only near the book's
    // design point. Rolling off on low-pressure steam would drain the
    // boiler through a cycle far below the one the book specifies.
    bool can_run = (load_cap_kw > 0.0) && (boiler_temp >= 240.0) &&
                   (steam_kg > 0.05) && (pressure >= 3.5);
    if (can_run) {
      double dp_avail_pa = std::max(0.0, (pressure - cond_p)) * 1.0e6;
      double k_eff = valve_reversed ? p.valve_k_fwd * 2.0 : p.valve_k_fwd;
      double cap_flow = std::sqrt(dp_avail_pa / k_eff); // kg/s through valve
      // Trial specific work at full boiler pressure (no throttle).
      double sf = liquid_entropy_kj_kgk(cond_temp), sg = vapor_entropy_kj_kgk(cond_temp);
      auto specific_work = [&](double s_in) {
        double x = clampd((s_in - sf) / (sg - sf), 0.0, 1.0);
        double h4s = liquid_enthalpy_kj_kg(cond_temp) + x * latent_heat_kj_kg(cond_temp);
        return p.turbine_eff * (h_boiler - h4s);
      };
      double w_full = specific_work(s_boiler); // kJ/kg
      if (w_full > 1.0) {
        double denom = w_full * p.generator_eff / 3600.0; // kW per (kg/h)
        double flow_req = (denom > 0) ? (load_cap_kw / denom) : 0.0; // kg/h
        double flow_kgs = std::min(flow_req / 3600.0, cap_flow);
        // Throttle across the valve: isenthalpic, entropy rises.
        valve_dp = k_eff * flow_kgs * flow_kgs;
        inlet_p = std::max(cond_p, pressure - valve_dp / 1.0e6);
        double s_in = s_boiler + 0.4615 * std::log(std::max(1.0, pressure / std::max(inlet_p, 1e-9)));
        double w_actual = specific_work(s_in);
        if (w_actual > 1.0 && flow_kgs > 0.0) {
          turb_flow = flow_kgs * 3600.0; // kg/h
          enth_drop = w_actual;
          p_shaft = turb_flow * w_actual / 3600.0;
          double pump_ideal = 0.001008 * (pressure - cond_p) * 1000.0; // kJ/kg
          p_pump = turb_flow * (pump_ideal / p.pump_eff) / 3600.0;
        }
      }
      // Reynolds number in the main channel at the achieved flow (A-10).
      double area = PI * p.pipe_id_m * p.pipe_id_m / 4.0;
      double dens = 1000.0, mu = 0.00028; // hot-water order values, stated constants
      double vel = (turb_flow / 3600.0) / (dens * area);
      reynolds = dens * vel * p.pipe_id_m / mu;
      diod = valve_diodicity(reynolds);
      if (valve_reversed) {
        double dp_design = (p.design_pressure_mpa - sat_pressure_mpa(40.0)) * 1.0e6;
        bypass_flow = p.bypass_fraction * rated_flow_kgs * 3600.0 *
                      std::sqrt(std::max(0.0, (pressure - cond_p) * 1.0e6) / dp_design);
      }
    }
    double p_gross = p_shaft * p.generator_eff;
    double p_par = 0.0, p_net = 0.0;
    if (p_gross > 0.0) {
      p_par = p_pump + p.parasitic_base_kw;
      p_net = std::max(0.0, p_gross - p_par);
    }
    double target_rpm = (turb_flow > 0.0 && p_shaft > 0.0)
        ? std::min(p.max_rpm, p.rated_rpm * (p_shaft / 5.0)) : 0.0;
    rpm += (target_rpm - rpm) * (1.0 - std::exp(-6.0 * dt_h));
    if (turb_flow <= 0.0 && rpm < 1.0) rpm = 0.0;

    rec.reynolds = reynolds; rec.diodicity = diod; rec.valve_dp_pa = valve_dp;
    rec.turbine_flow_kg_h = turb_flow; rec.bypass_flow_kg_h = bypass_flow;
    rec.reverse_leak_kg_h = bypass_flow;
    rec.turbine_inlet_mpa = inlet_p; rec.enthalpy_drop_kj_kg = enth_drop;
    rec.p_shaft_kw = p_shaft; rec.rpm = rpm;
    rec.p_gross_kw = p_gross; rec.p_pump_kw = p_pump;
    rec.p_parasitic_kw = p_par; rec.p_net_kw = p_net;
    rec.boiler_enthalpy_flow_kw = turb_flow * h_boiler / 3600.0;
    cum_enth += rec.boiler_enthalpy_flow_kw * dt_h;
    cum_shaft += p_shaft * dt_h; cum_gross += p_gross * dt_h; cum_net += p_net * dt_h;
    r.peak_net_kw = std::max(r.peak_net_kw, p_net);
    r.peak_gross_kw = std::max(r.peak_gross_kw, p_gross);

    // --- Condenser: exhaust arrives, heat is rejected to ambient.
    double out_kg = (turb_flow + bypass_flow) * dt_h;
    double steam_out = std::min(steam_kg, out_kg);
    double liq_out = out_kg - steam_out;
    double h_exhaust = liquid_enthalpy_kj_kg(cond_temp);
    double exhaust_energy_kwh = 0.0;
    if (turb_flow > 0.0) {
      double h4 = h_boiler - enth_drop;
      exhaust_energy_kwh += turb_flow * dt_h * (h4 - h_exhaust) / 3600.0;
    }
    if (bypass_flow > 0.0) {
      exhaust_energy_kwh += bypass_flow * dt_h * (h_boiler - h_exhaust) / 3600.0;
    }
    exhaust_kg += out_kg;
    cond_backlog_kwh += std::max(0.0, exhaust_energy_kwh);
    double ua_kw_k = p.condenser_u * p.condenser_area_m2 / 1000.0;
    double p_reject_cap = ua_kw_k * std::max(0.0, cond_temp - ambient);
    double p_reject = std::min(p_reject_cap, cond_backlog_kwh / dt_h);
    double removed_kwh = p_reject * dt_h;
    double frac = (cond_backlog_kwh > 1e-12) ? removed_kwh / cond_backlog_kwh : 0.0;
    double condensed_kg = exhaust_kg * frac;
    cond_backlog_kwh -= removed_kwh;
    exhaust_kg -= condensed_kg;
    condenser_kg += condensed_kg;
    cum_cond += removed_kwh;
    rec.p_condenser_kw = p_reject;
    rec.condensed_kg_h = condensed_kg / dt_h;

    // --- Return pump: matches turbine draw while generating; at night it
    // walks the condensate home at a stated 15 kg/h.
    double return_kg = 0.0;
    if (turb_flow > 0.0) return_kg = std::min(condenser_kg, turb_flow * dt_h);
    else if (condenser_kg > 0.0 && boiler_kg < p.boiler_water_kg)
      return_kg = std::min({condenser_kg, 15.0 * dt_h, p.boiler_water_kg - boiler_kg});
    condenser_kg -= return_kg;
    rec.return_kg_h = return_kg / dt_h;
    rec.flow_direction = (turb_flow > 0.0) ? 1 : ((return_kg > 0.0 || condensed_kg > 0.0) ? -1 : 0);

    // --- Boiler ledger (enthalpy basis).
    double standby_kw = p.boiler_loss_kw_per_k * std::max(0.0, boiler_temp - ambient);
    cum_standby += standby_kw * dt_h;
    boiler_energy_mj -= out_kg * h_boiler / 1000.0;
    boiler_energy_mj += return_kg * liquid_enthalpy_kj_kg(cond_temp) / 1000.0;
    boiler_energy_mj += p_heat * dt_h * 3.6;
    boiler_energy_mj -= standby_kw * dt_h * 3.6;
    if (boiler_energy_mj < 0.0) boiler_energy_mj = 0.0;
    boiler_kg = boiler_kg - out_kg + return_kg;
    (void)steam_out; (void)liq_out;

    // Invert thermal content to (temperature, steam mass, pressure).
    // Two-phase region: the rigid vessel volume fixes the steam mass at each
    // saturation temperature (A-29), so temperature follows the saturation
    // curve as energy is added. At the design pressure the steam buffer is
    // full; surplus energy superheats the steam at design pressure instead
    // of raising pressure past it (A-28).
    auto steam_vol = [&](double tc, double mass) {
      double rho = sat_pressure_mpa(tc) * 1000.0 / (0.4615 * (tc + 273.15)); // kg/m3
      double vf = 0.001 + 4.0e-9 * tc * tc; // saturated liquid m3/kg, approx
      double s = rho * (p.vessel_volume_m3 - mass * vf) / (1.0 - rho * vf);
      return clampd(s, 0.0, mass);
    };
    auto e_model = [&](double tc) {
      double s = steam_vol(tc, boiler_kg);
      return ((boiler_kg - s) * liquid_enthalpy_kj_kg(tc) +
              s * vapor_enthalpy_kj_kg(tc)) / 1000.0;
    };
    double t_design_sat = sat_temp_c(p.design_pressure_mpa);
    double e_switch = e_model(t_design_sat);
    if (boiler_kg <= 0.0) {
      steam_kg = 0.0; boiler_temp = ambient; pressure = sat_pressure_mpa(0.5);
    } else if (boiler_energy_mj <= e_switch) {
      double lo = 0.0, hi = t_design_sat;
      for (int it = 0; it < 60; ++it) {
        double mid = 0.5 * (lo + hi);
        if (e_model(mid) < boiler_energy_mj) lo = mid; else hi = mid;
      }
      boiler_temp = 0.5 * (lo + hi);
      steam_kg = steam_vol(boiler_temp, boiler_kg);
      pressure = sat_pressure_mpa(std::max(0.5, boiler_temp));
    } else {
      double s_sw = steam_vol(t_design_sat, boiler_kg);
      steam_kg = s_sw;
      pressure = p.design_pressure_mpa;
      double extra_kj = (boiler_energy_mj - e_switch) * 1000.0;
      boiler_temp = t_design_sat + extra_kj / std::max(1.0, s_sw * 2.1);
      if (boiler_temp > 450.0) { // relief bound: surplus is vented, counted as loss
        double kept_kj = (450.0 - t_design_sat) * s_sw * 2.1;
        cum_standby += (extra_kj - kept_kj) / 3600.0;
        boiler_energy_mj = e_switch + kept_kj / 1000.0;
        boiler_temp = 450.0;
      }
    }

    // Condenser temperature relaxes toward ambient + approach + load effect.
    double load_effect = clampd(cond_backlog_kwh * 2.0, 0.0, 25.0);
    double cond_target = clampd(ambient + 12.0 + load_effect, 35.0, 75.0);
    cond_temp += (cond_target - cond_temp) * (1.0 - std::exp(-2.0 * dt_h));

    rec.steam_kg = steam_kg; rec.boiler_kg = boiler_kg;
    rec.exhaust_kg = exhaust_kg; rec.condenser_kg = condenser_kg;
    rec.total_water_kg = boiler_kg + exhaust_kg + condenser_kg;
    rec.cum_solar_kwh = cum_solar; rec.cum_optical_kwh = cum_opt;
    rec.cum_heat_kwh = cum_heat; rec.cum_enthalpy_kwh = cum_enth;
    rec.cum_shaft_kwh = cum_shaft; rec.cum_gross_kwh = cum_gross;
    rec.cum_net_kwh = cum_net; rec.cum_condenser_kwh = cum_cond;
    rec.cum_optical_loss_kwh = cum_opt_loss; rec.cum_receiver_loss_kwh = cum_rec_loss;
    rec.cum_standby_loss_kwh = cum_standby;
    double transit_kwh = (exhaust_kg + condenser_kg) * liquid_enthalpy_kj_kg(cond_temp) / 3600.0;
    double stored = (boiler_energy_mj - boiler_energy0_mj) / 3.6 + cond_backlog_kwh +
                    transit_kwh - transit0_kwh;
    rec.stored_kwh = stored;
    rec.balance_residual_kwh = cum_solar - (cum_opt_loss + cum_rec_loss + cum_gross +
                                            cum_cond + cum_standby + stored);
    if (collect_steps) r.steps.push_back(rec);
    if (i == nsteps - 1) {
      r.total_solar_kwh = cum_solar; r.total_heat_kwh = cum_heat;
      r.total_gross_kwh = cum_gross; r.total_net_kwh = cum_net;
      r.total_condenser_kwh = cum_cond;
      r.water_end_kg = boiler_kg + exhaust_kg + condenser_kg;
      r.balance_residual_kwh = rec.balance_residual_kwh;
    }
  }
  r.water_delta_kg = r.water_end_kg - r.water_start_kg;
  return r;
}

std::string summary_string(const SimResult& r, const std::string& scenario,
                           double load_cap_kw, bool valve_reversed) {
  char buf[1024];
  std::snprintf(buf, sizeof buf,
    "%s|load=%.3f|rev=%d|hours=%.2f|solar=%.4f|heat=%.4f|gross=%.4f|net=%.4f|cond=%.4f|"
    "peaknet=%.4f|water=%.4f->%.4f|resid=%.4f",
    scenario.c_str(), load_cap_kw, valve_reversed ? 1 : 0, r.hours,
    r.total_solar_kwh, r.total_heat_kwh, r.total_gross_kwh, r.total_net_kwh,
    r.total_condenser_kwh, r.peak_net_kw, r.water_start_kg, r.water_end_kg,
    r.balance_residual_kwh);
  return std::string(buf);
}

} // namespace ene
