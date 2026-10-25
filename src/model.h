#pragma once
#include <string>
#include <vector>

namespace ene {

// Reference-unit parameters. BOOK values are traced in SPEC.md (B-xx).
// ASSUMPTION values are traced in SPEC.md (A-xx). No third-party code.
struct Params {
  double aperture_m2 = 40.0;          // B-46
  double concentration = 60.0;        // B-09
  double optical_eff = 0.75;          // B-07
  double receiver_eff = 0.67;         // B-44
  double design_pressure_mpa = 4.0;   // B-16
  double design_superheat_c = 400.0;  // B-17
  double turbine_eff = 0.75;          // B-21
  double pump_eff = 0.65;             // B-22
  double generator_eff = 0.95;        // B-55
  double condenser_area_m2 = 51.0;    // B-49
  double condenser_u = 8.0;           // B-33 (W/m2 K)
  double nameplate_kw = 7.0;          // A-16 (top of B-50 class)
  double total_water_kg = 250.0;      // A-02
  double boiler_water_kg = 180.0;     // A-03
  double steam_target_kg = 25.0;      // A-04
  double pipe_id_m = 0.050;           // A-10
  double valve_stages = 11.0;         // A-11
  double valve_k_fwd = 6.0e9;         // A-12 Pa per (kg/s)^2
  double bypass_fraction = 0.06;      // A-13
  double rated_rpm = 3000.0;          // A-15
  double max_rpm = 3600.0;            // A-15
  double parasitic_base_kw = 0.027;   // A-17
  double boiler_loss_kw_per_k = 0.0015; // A-27
  double vessel_volume_m3 = 1.6;      // A-29 (steam space sizes the buffer)
  double latitude = 33.046;           // Lewisville, Texas (bundled default)
  double longitude = -96.994;
  int start_day_of_year = 1;          // day of year of t = 0 (annual runs: 1)
};

struct WeatherStep {
  double dni_w_m2;
  double ambient_c;
};

struct SolarPos {
  double elevation_deg;
  double azimuth_deg;
  double declination_deg;
  double equation_time_min;
};

// Steam correlations (A-18): transparent IAPWS-style fits, calibrated so the
// book's Chapter 3 cycle table reproduces within stated tolerance.
double sat_pressure_mpa(double temp_c);
double sat_temp_c(double pressure_mpa);
double liquid_enthalpy_kj_kg(double temp_c);              // h_f
double latent_heat_kj_kg(double temp_c);                   // h_fg
double vapor_enthalpy_kj_kg(double temp_c);                // h_g at saturation
double liquid_entropy_kj_kgk(double temp_c);               // s_f
double vapor_entropy_kj_kgk(double temp_c);                // s_g at saturation
double steam_enthalpy_kj_kg(double pressure_mpa, double temp_c); // sat or superheated
double steam_entropy_kj_kgk(double pressure_mpa, double temp_c);
double valve_diodicity(double reynolds);                   // A-14 / B-37..B-40
SolarPos solar_position(int day_of_year, double utc_hour, double lat_deg, double lon_deg);

// Fixed state-point Rankine calculation (the book's Chapter 3 procedure).
struct CyclePoint {
  double h1, h2, h3, h4s, h4;
  double pump_work_kj_kg;
  double turbine_work_kj_kg;
  double heat_in_kj_kg;
  double efficiency;
};
CyclePoint rankine_cycle(double pressure_mpa, double superheat_c, double condenser_c,
                         double turbine_eff, double pump_eff);

struct StepRecord {
  double t_h = 0.0;
  double dni_w_m2 = 0.0, ambient_c = 0.0;
  double solar_elev_deg = 0.0, solar_azim_deg = 0.0;
  double p_solar_kw = 0.0, p_optical_kw = 0.0, p_heat_kw = 0.0;
  double receiver_temp_c = 0.0, boiler_temp_c = 0.0, boiler_pressure_mpa = 0.0;
  double sat_temp_c = 0.0, superheat_c = 0.0;
  double steam_kg = 0.0, boiler_kg = 0.0, exhaust_kg = 0.0, condenser_kg = 0.0, total_water_kg = 0.0;
  double boiler_enthalpy_flow_kw = 0.0;
  double reynolds = 0.0, diodicity = 1.0, valve_dp_pa = 0.0;
  double turbine_flow_kg_h = 0.0, bypass_flow_kg_h = 0.0, reverse_leak_kg_h = 0.0;
  int flow_direction = 0; // +1 power leg forward, -1 return leg active, 0 idle
  double turbine_inlet_mpa = 0.0, enthalpy_drop_kj_kg = 0.0;
  double p_shaft_kw = 0.0, rpm = 0.0;
  double p_gross_kw = 0.0, p_pump_kw = 0.0, p_parasitic_kw = 0.0, p_net_kw = 0.0;
  double condenser_temp_c = 0.0, p_condenser_kw = 0.0, condensed_kg_h = 0.0, return_kg_h = 0.0;
  double cum_solar_kwh = 0.0, cum_optical_kwh = 0.0, cum_heat_kwh = 0.0;
  double cum_enthalpy_kwh = 0.0, cum_shaft_kwh = 0.0, cum_gross_kwh = 0.0, cum_net_kwh = 0.0;
  double cum_condenser_kwh = 0.0, cum_optical_loss_kwh = 0.0, cum_receiver_loss_kwh = 0.0;
  double cum_standby_loss_kwh = 0.0;
  double stored_kwh = 0.0, balance_residual_kwh = 0.0;
};

struct SimResult {
  std::vector<StepRecord> steps;
  double hours = 0.0;
  double total_solar_kwh = 0.0, total_heat_kwh = 0.0, total_gross_kwh = 0.0;
  double total_net_kwh = 0.0, total_condenser_kwh = 0.0;
  double peak_net_kw = 0.0, peak_gross_kw = 0.0;
  double water_start_kg = 0.0, water_end_kg = 0.0, water_delta_kg = 0.0;
  double balance_residual_kwh = 0.0;
  std::string digest;
};

// Fixed-step deterministic integration. Weather is held constant per hour
// (A-20); the caller supplies one WeatherStep per hour of the run.
SimResult simulate(const Params& p, const std::vector<WeatherStep>& hourly,
                   double dt_h, double load_cap_kw, bool valve_reversed,
                   bool collect_steps);

std::string fnv1a64(const std::string& s);
std::string summary_string(const SimResult& r, const std::string& scenario,
                           double load_cap_kw, bool valve_reversed);

} // namespace ene
