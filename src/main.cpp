#include "model.h"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <cmath>

using namespace ene;
static const double PI = 3.14159265358979323846;

// Scenario weather definitions. These exact formulas are mirrored in
// oracle/model.py and docs/solver.js; the parity battery depends on it.
static std::vector<WeatherStep> scenario_weather(const std::string& name, Params& p) {
  std::vector<WeatherStep> w(24);
  if (name == "night-only" || name == "zero-control") {
    p.start_day_of_year = 172;
    for (auto& s : w) { s.dni_w_m2 = 0.0; s.ambient_c = 15.0; }
    return w;
  }
  int doy = 172; double peak = 950.0, expo = 1.15, mean = 31.0, amp = 5.0;
  if (name == "winter-clear") { doy = 355; peak = 520.0; expo = 1.20; mean = 8.0; amp = 6.0; }
  if (name == "book-design-day") { doy = 135; peak = 950.0; expo = 1.15; mean = 28.0; amp = 5.0; }
  p.start_day_of_year = doy;
  double decl_deg = -23.44 * std::cos(2.0 * PI * (doy + 10) / 365.0);
  double lat = p.latitude * PI / 180.0, decl = decl_deg * PI / 180.0;
  double cosH = -std::tan(lat) * std::tan(decl);
  cosH = std::max(-1.0, std::min(1.0, cosH));
  double daylen = 2.0 * std::acos(cosH) * 180.0 / PI / 15.0;
  double sunrise = 12.0 - daylen / 2.0;
  double raw[24];
  for (int h = 0; h < 24; ++h) {
    SolarPos sp = solar_position(doy, h + 0.5, p.latitude, p.longitude);
    double lst = h + 0.5 + p.longitude / 15.0 + sp.equation_time_min / 60.0;
    while (lst < sunrise - 12.0) lst += 24.0;
    while (lst >= sunrise + 12.0) lst -= 24.0;
    double shape = std::sin(PI * (lst - sunrise) / daylen);
    raw[h] = (shape > 0) ? std::pow(shape, expo) : 0.0;
    w[h].ambient_c = mean - amp * std::cos(2.0 * PI * (lst - 15.0) / 24.0);
  }
  if (name == "book-design-day") {
    double sum = 0; for (int h = 0; h < 24; ++h) sum += raw[h];
    double scale = 5500.0 / sum; // Wh/m2 over the day = 5.5 kWh/m2 (B-42)
    for (int h = 0; h < 24; ++h) w[h].dni_w_m2 = raw[h] * scale;
  } else {
    for (int h = 0; h < 24; ++h) w[h].dni_w_m2 = raw[h] * peak;
  }
  return w;
}

static void print_summary_json(const SimResult& r, const std::string& name,
                               double load, bool rev) {
  std::string sum = summary_string(r, name, load, rev);
  std::string dig = fnv1a64(sum);
  std::printf("{\"scenario\":\"%s\",\"load_kw\":%.3f,\"reversed\":%s,\"hours\":%.1f,"
              "\"solar_kwh\":%.4f,\"heat_kwh\":%.4f,\"gross_kwh\":%.4f,\"net_kwh\":%.4f,"
              "\"condenser_kwh\":%.4f,\"peak_net_kw\":%.4f,\"water_start_kg\":%.4f,"
              "\"water_end_kg\":%.4f,\"water_delta_kg\":%.6f,\"balance_residual_kwh\":%.4f,"
              "\"digest\":\"%s\"}\n",
              name.c_str(), load, rev ? "true" : "false", r.hours, r.total_solar_kwh,
              r.total_heat_kwh, r.total_gross_kwh, r.total_net_kwh, r.total_condenser_kwh,
              r.peak_net_kw, r.water_start_kg, r.water_end_kg, r.water_delta_kg,
              r.balance_residual_kwh, dig.c_str());
}

static void write_steps_csv(const SimResult& r, const std::string& path) {
  std::ofstream f(path);
  f << "t_h,dni,ambient,solar_kw,heat_kw,boiler_c,pressure_mpa,steam_kg,turbine_kg_h,"
       "shaft_kw,rpm,gross_kw,net_kw,condenser_c,condenser_kw,boiler_kg,exhaust_kg,"
       "condenser_kg,cum_net_kwh,balance_residual_kwh\n";
  char buf[640];
  for (const auto& s : r.steps) {
    std::snprintf(buf, sizeof buf,
      "%.2f,%.2f,%.2f,%.4f,%.4f,%.2f,%.4f,%.3f,%.3f,%.4f,%.1f,%.4f,%.4f,%.2f,%.4f,"
      "%.3f,%.3f,%.3f,%.4f,%.4f\n",
      s.t_h, s.dni_w_m2, s.ambient_c, s.p_solar_kw, s.p_heat_kw, s.boiler_temp_c,
      s.boiler_pressure_mpa, s.steam_kg, s.turbine_flow_kg_h, s.p_shaft_kw, s.rpm,
      s.p_gross_kw, s.p_net_kw, s.condenser_temp_c, s.p_condenser_kw, s.boiler_kg,
      s.exhaust_kg, s.condenser_kg, s.cum_net_kwh, s.balance_residual_kwh);
    f << buf;
  }
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: ene-model <cycle|scenario|steps|csv|sat>\n");
    return 2;
  }
  std::string cmd = argv[1];
  Params p;
  if (cmd == "cycle") {
    auto ideal = rankine_cycle(4.0, 400.0, 40.0, 1.0, 1.0);
    auto real = rankine_cycle(4.0, 400.0, 40.0, 0.75, 0.65);
    auto pess = rankine_cycle(4.0, 400.0, 40.0, 0.55, 0.50);
    std::printf("{\"ideal_eff\":%.4f,\"realistic_eff\":%.4f,\"pessimistic_eff\":%.4f,"
                "\"h3\":%.2f,\"h4s\":%.2f,\"sat_t_at_1atm_c\":%.3f,"
                "\"sat_p_at_250c_mpa\":%.4f,\"di_at_re800\":%.3f}\n",
                ideal.efficiency, real.efficiency, pess.efficiency, real.h3, real.h4s,
                sat_temp_c(0.101325), sat_pressure_mpa(250.0), valve_diodicity(800.0));
    return 0;
  }
  if (cmd == "sat") {
    double t = std::atof(argv[2]);
    std::printf("{\"t_c\":%.2f,\"p_mpa\":%.5f,\"tsat_of_p_c\":%.3f}\n",
                t, sat_pressure_mpa(t), sat_temp_c(sat_pressure_mpa(t)));
    return 0;
  }
  if (cmd == "scenario" || cmd == "steps") {
    std::string name = argv[2];
    bool rev = false; double load = 5.0; std::string out;
    for (int i = 3; i < argc; ++i) {
      if (std::strcmp(argv[i], "--reversed") == 0) rev = true;
      else if (std::strcmp(argv[i], "--load") == 0) load = std::atof(argv[++i]);
      else if (std::strcmp(argv[i], "--out") == 0) out = argv[++i];
    }
    if (name == "reversed-valve") { name = "summer-clear"; rev = true; }
    int days = 1;
    for (int i = 3; i < argc; ++i)
      if (std::strcmp(argv[i], "--days") == 0) days = std::atoi(argv[++i]);
    auto w1 = scenario_weather(name, p);
    std::vector<WeatherStep> w;
    for (int d = 0; d < days; ++d) w.insert(w.end(), w1.begin(), w1.end());
    SimResult r = simulate(p, w, 0.05, load, rev, cmd == "steps");
    if (cmd == "steps" && !out.empty()) write_steps_csv(r, out);
    print_summary_json(r, name, load, rev);
    return 0;
  }
  if (cmd == "csv") {
    std::string path = argv[2];
    double load = 5.0, dt = 0.25; std::string out;
    for (int i = 3; i < argc; ++i) {
      if (std::strcmp(argv[i], "--load") == 0) load = std::atof(argv[++i]);
      else if (std::strcmp(argv[i], "--dt") == 0) dt = std::atof(argv[++i]);
      else if (std::strcmp(argv[i], "--out") == 0) out = argv[++i];
    }
    std::ifstream f(path);
    if (!f) { std::fprintf(stderr, "cannot open %s\n", path.c_str()); return 2; }
    std::vector<WeatherStep> w; std::string line; std::getline(f, line);
    while (std::getline(f, line)) {
      if (line.empty()) continue;
      std::stringstream ss(line); std::string ts, a, b;
      std::getline(ss, ts, ','); std::getline(ss, a, ','); std::getline(ss, b, ',');
      WeatherStep s; s.dni_w_m2 = std::atof(a.c_str()); s.ambient_c = std::atof(b.c_str());
      w.push_back(s);
    }
    SimResult r = simulate(p, w, dt, load, false, !out.empty());
    if (!out.empty()) write_steps_csv(r, out);
    print_summary_json(r, "csv:" + path, load, false);
    return 0;
  }
  std::fprintf(stderr, "unknown command\n");
  return 2;
}
