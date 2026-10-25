"""Energy Not Enemy: The Working Model, independent Python oracle.

Standard library only. This is a second, independent implementation of the
same lumped model specified in SPEC.md; it shares no code with the C++
solver. The verification battery (tests/run_battery.py) runs the same
scenarios through both and reports agreement.
"""
import math

PI = math.pi

PARAMS = dict(
    aperture_m2=40.0, concentration=60.0, optical_eff=0.75, receiver_eff=0.67,
    design_pressure_mpa=4.0, design_superheat_c=400.0, turbine_eff=0.75,
    pump_eff=0.65, generator_eff=0.95, condenser_area_m2=51.0, condenser_u=8.0,
    nameplate_kw=7.0, total_water_kg=250.0, boiler_water_kg=180.0,
    steam_target_kg=25.0, pipe_id_m=0.050, valve_stages=11.0,
    valve_k_fwd=6.0e9, bypass_fraction=0.06, rated_rpm=3000.0, max_rpm=3600.0,
    parasitic_base_kw=0.027, boiler_loss_kw_per_k=0.0015, vessel_volume_m3=1.6,
    latitude=33.046, longitude=-96.994, start_day_of_year=1,
)


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def liquid_enthalpy(t):
    return 4.05 * t + 0.0011 * t * t


def latent_heat(t):
    return 2501.0 - 1.83 * t - 0.0062 * t * t + 0.000004 * t * t * t


def vapor_enthalpy(t):
    return liquid_enthalpy(t) + latent_heat(t)


def liquid_entropy(t):
    return 4.186 * math.log((t + 273.15) / 273.15)


def vapor_entropy(t):
    return liquid_entropy(t) + latent_heat(t) / (t + 273.15)


def sat_pressure_mpa(t):
    if t <= 0.0:
        t = 0.01
    if t < 100.0:
        atm = 0.005893 * math.exp(17.502 * t / (240.97 + t))
        return atm * 0.101325
    tk = t + 273.15
    hfg_avg = 0.5 * (latent_heat(100.0) + latent_heat(t))
    ln_p = -(hfg_avg / 0.4615) * (1.0 / tk - 1.0 / 373.15)
    x = t - 100.0
    ln_p += 0.0011 * x + 0.000008 * x * x
    return math.exp(ln_p) * 0.101325


def sat_temp_c(p):
    lo, hi = 0.01, 373.9
    if p <= sat_pressure_mpa(lo):
        return lo
    if p >= sat_pressure_mpa(hi):
        return hi
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if sat_pressure_mpa(mid) < p:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def steam_enthalpy(p, t):
    ts = sat_temp_c(p)
    if t <= ts:
        return vapor_enthalpy(ts)
    return vapor_enthalpy(ts) + 2.1 * (t - ts)


def steam_entropy(p, t):
    ts = sat_temp_c(p)
    if t <= ts:
        return vapor_entropy(ts)
    return vapor_entropy(ts) + 2.1 * math.log((t + 273.15) / (ts + 273.15))


def valve_diodicity(re):
    if re <= 100.0:
        return 1.0
    if re >= 300.0:
        return 2.0
    return 1.0 + (re - 100.0) / 200.0


def solar_position(doy, utc_hour, lat_deg, lon_deg):
    gamma = 2.0 * PI / 365.0 * (doy - 1 + (utc_hour - 12.0) / 24.0)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(gamma)
                       - 0.032077 * math.sin(gamma)
                       - 0.014615 * math.cos(2 * gamma)
                       - 0.040849 * math.sin(2 * gamma))
    decl = (0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma)
            - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma)
            - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma))
    tst = utc_hour * 60.0 + eqtime + 4.0 * lon_deg
    while tst < 0:
        tst += 1440.0
    while tst >= 1440.0:
        tst -= 1440.0
    ha_deg = tst / 4.0 - 180.0
    if ha_deg < -180.0:
        ha_deg += 360.0
    ha = ha_deg * PI / 180.0
    lat = lat_deg * PI / 180.0
    cosz = clamp(math.sin(lat) * math.sin(decl)
                 + math.cos(lat) * math.cos(decl) * math.cos(ha), -1.0, 1.0)
    elev = 90.0 - math.acos(cosz) * 180.0 / PI
    az = math.atan2(math.sin(ha),
                    math.cos(ha) * math.sin(lat) - math.tan(decl) * math.cos(lat))
    return dict(elevation_deg=elev, azimuth_deg=az * 180.0 / PI + 180.0,
                declination_deg=decl * 180.0 / PI, equation_time_min=eqtime)


def rankine_cycle(p_mpa, t_super, cond_c, eta_t, eta_p):
    p_cond = sat_pressure_mpa(cond_c)
    h1 = liquid_enthalpy(cond_c)
    pump_ideal = 0.001008 * (p_mpa - p_cond) * 1000.0
    pump_work = pump_ideal / eta_p
    h2 = h1 + pump_work
    h3 = steam_enthalpy(p_mpa, t_super)
    s3 = steam_entropy(p_mpa, t_super)
    sf, sg = liquid_entropy(cond_c), vapor_entropy(cond_c)
    x = clamp((s3 - sf) / (sg - sf), 0.0, 1.0)
    h4s = liquid_enthalpy(cond_c) + x * latent_heat(cond_c)
    turb_work = eta_t * (h3 - h4s)
    return dict(h1=h1, h2=h2, h3=h3, h4s=h4s, h4=h3 - turb_work,
                pump_work=pump_work, turbine_work=turb_work,
                heat_in=h3 - h2,
                efficiency=(turb_work - pump_work) / (h3 - h2))


def simulate(p, hourly, dt_h, load_cap_kw, valve_reversed, collect_steps=False):
    total_h = float(len(hourly))
    water_start = p['total_water_kg']
    ambient0 = hourly[0][1] if hourly else 20.0
    boiler_kg = p['boiler_water_kg']
    steam_kg = 0.0
    exhaust_kg = 0.0
    condenser_kg = p['total_water_kg'] - p['boiler_water_kg']
    boiler_temp = ambient0
    pressure = sat_pressure_mpa(max(0.5, boiler_temp))
    cond_temp = clamp(ambient0 + 12.0, 35.0, 75.0)
    boiler_energy_mj = boiler_kg * liquid_enthalpy(boiler_temp) / 1000.0
    boiler_energy0_mj = boiler_energy_mj
    cond_backlog_kwh = 0.0
    transit0_kwh = condenser_kg * liquid_enthalpy(cond_temp) / 3600.0
    rpm = 0.0
    cum = dict(solar=0.0, opt=0.0, heat=0.0, enth=0.0, shaft=0.0, gross=0.0,
               net=0.0, cond=0.0, opt_loss=0.0, rec_loss=0.0, standby=0.0)
    peak_net = 0.0
    peak_gross = 0.0
    steps = []
    last = {}
    nsteps = int(math.ceil(total_h / dt_h - 1e-9))
    for i in range(nsteps):
        t = i * dt_h
        hi = min(int(math.floor(t + 1e-9)), len(hourly) - 1)
        dni_in, ambient = hourly[max(0, hi)]
        doy = p['start_day_of_year'] + int(math.floor(t / 24.0))
        utc_hour = t - 24.0 * math.floor(t / 24.0)
        sun = solar_position(doy, utc_hour, p['latitude'], p['longitude'])
        dni = dni_in if sun['elevation_deg'] > 0.0 else 0.0

        p_solar = dni * p['aperture_m2'] / 1000.0
        p_opt = p_solar * p['optical_eff']
        p_heat = p_opt * p['receiver_eff']
        cum['solar'] += p_solar * dt_h
        cum['opt'] += p_opt * dt_h
        cum['heat'] += p_heat * dt_h
        cum['opt_loss'] += (p_solar - p_opt) * dt_h
        cum['rec_loss'] += (p_opt - p_heat) * dt_h

        tsat = sat_temp_c(pressure)
        superheat = max(0.0, boiler_temp - tsat)
        rec_boiler_temp = boiler_temp
        rec_pressure = pressure
        cond_p = sat_pressure_mpa(cond_temp)
        h_boiler = (steam_enthalpy(pressure, boiler_temp) if steam_kg > 0.5
                    else liquid_enthalpy(boiler_temp))
        s_boiler = steam_entropy(pressure, max(boiler_temp, tsat))
        rated_flow_kgs = 0.00886
        turb_flow = 0.0
        bypass_flow = 0.0
        p_shaft = 0.0
        p_pump = 0.0
        valve_dp = 0.0
        inlet_p = pressure
        enth_drop = 0.0
        reynolds = 0.0
        diod = 1.0
        can_run = (load_cap_kw > 0.0 and boiler_temp >= 240.0
                   and steam_kg > 0.05 and pressure >= 3.5)
        if can_run:
            dp_avail = max(0.0, pressure - cond_p) * 1.0e6
            k_eff = p['valve_k_fwd'] * (2.0 if valve_reversed else 1.0)
            cap_flow = math.sqrt(dp_avail / k_eff)
            sf = liquid_entropy(cond_temp)
            sg = vapor_entropy(cond_temp)

            def specific_work(s_in):
                x = clamp((s_in - sf) / (sg - sf), 0.0, 1.0)
                h4s = liquid_enthalpy(cond_temp) + x * latent_heat(cond_temp)
                return p['turbine_eff'] * (h_boiler - h4s)

            w_full = specific_work(s_boiler)
            if w_full > 1.0:
                denom = w_full * p['generator_eff'] / 3600.0
                flow_req = (load_cap_kw / denom) if denom > 0 else 0.0
                flow_kgs = min(flow_req / 3600.0, cap_flow)
                valve_dp = k_eff * flow_kgs * flow_kgs
                inlet_p = max(cond_p, pressure - valve_dp / 1.0e6)
                s_in = s_boiler + 0.4615 * math.log(
                    max(1.0, pressure / max(inlet_p, 1e-9)))
                w_actual = specific_work(s_in)
                if w_actual > 1.0 and flow_kgs > 0.0:
                    turb_flow = flow_kgs * 3600.0
                    enth_drop = w_actual
                    p_shaft = turb_flow * w_actual / 3600.0
                    pump_ideal = 0.001008 * (pressure - cond_p) * 1000.0
                    p_pump = turb_flow * (pump_ideal / p['pump_eff']) / 3600.0
            area = PI * p['pipe_id_m'] ** 2 / 4.0
            vel = (turb_flow / 3600.0) / (1000.0 * area)
            reynolds = 1000.0 * vel * p['pipe_id_m'] / 0.00028
            diod = valve_diodicity(reynolds)
            if valve_reversed:
                dp_design = (p['design_pressure_mpa']
                             - sat_pressure_mpa(40.0)) * 1.0e6
                bypass_flow = (p['bypass_fraction'] * rated_flow_kgs * 3600.0
                               * math.sqrt(max(0.0, (pressure - cond_p) * 1.0e6)
                                           / dp_design))
        p_gross = p_shaft * p['generator_eff']
        p_par = 0.0
        p_net = 0.0
        if p_gross > 0.0:
            p_par = p_pump + p['parasitic_base_kw']
            p_net = max(0.0, p_gross - p_par)
        target_rpm = (min(p['max_rpm'], p['rated_rpm'] * (p_shaft / 5.0))
                      if (turb_flow > 0.0 and p_shaft > 0.0) else 0.0)
        rpm += (target_rpm - rpm) * (1.0 - math.exp(-6.0 * dt_h))
        if turb_flow <= 0.0 and rpm < 1.0:
            rpm = 0.0
        cum['enth'] += turb_flow * h_boiler / 3600.0 * dt_h
        cum['shaft'] += p_shaft * dt_h
        cum['gross'] += p_gross * dt_h
        cum['net'] += p_net * dt_h
        peak_net = max(peak_net, p_net)
        peak_gross = max(peak_gross, p_gross)

        out_kg = (turb_flow + bypass_flow) * dt_h
        h_exhaust = liquid_enthalpy(cond_temp)
        exhaust_energy = 0.0
        if turb_flow > 0.0:
            h4 = h_boiler - enth_drop
            exhaust_energy += turb_flow * dt_h * (h4 - h_exhaust) / 3600.0
        if bypass_flow > 0.0:
            exhaust_energy += bypass_flow * dt_h * (h_boiler - h_exhaust) / 3600.0
        exhaust_kg += out_kg
        cond_backlog_kwh += max(0.0, exhaust_energy)
        ua = p['condenser_u'] * p['condenser_area_m2'] / 1000.0
        p_reject = min(ua * max(0.0, cond_temp - ambient), cond_backlog_kwh / dt_h)
        removed = p_reject * dt_h
        frac = removed / cond_backlog_kwh if cond_backlog_kwh > 1e-12 else 0.0
        condensed_kg = exhaust_kg * frac
        cond_backlog_kwh -= removed
        exhaust_kg -= condensed_kg
        condenser_kg += condensed_kg
        cum['cond'] += removed

        return_kg = 0.0
        if turb_flow > 0.0:
            return_kg = min(condenser_kg, turb_flow * dt_h)
        elif condenser_kg > 0.0 and boiler_kg < p['boiler_water_kg']:
            return_kg = min(condenser_kg, 15.0 * dt_h,
                            p['boiler_water_kg'] - boiler_kg)
        condenser_kg -= return_kg

        standby_kw = p['boiler_loss_kw_per_k'] * max(0.0, boiler_temp - ambient)
        cum['standby'] += standby_kw * dt_h
        boiler_energy_mj -= out_kg * h_boiler / 1000.0
        boiler_energy_mj += return_kg * liquid_enthalpy(cond_temp) / 1000.0
        boiler_energy_mj += p_heat * dt_h * 3.6
        boiler_energy_mj -= standby_kw * dt_h * 3.6
        if boiler_energy_mj < 0.0:
            boiler_energy_mj = 0.0
        boiler_kg = boiler_kg - out_kg + return_kg

        def steam_vol(tc, mass):
            rho = sat_pressure_mpa(tc) * 1000.0 / (0.4615 * (tc + 273.15))
            vf = 0.001 + 4.0e-9 * tc * tc
            s = rho * (p['vessel_volume_m3'] - mass * vf) / (1.0 - rho * vf)
            return clamp(s, 0.0, mass)

        def e_model(tc):
            s = steam_vol(tc, boiler_kg)
            return ((boiler_kg - s) * liquid_enthalpy(tc)
                    + s * vapor_enthalpy(tc)) / 1000.0

        t_design_sat = sat_temp_c(p['design_pressure_mpa'])
        e_switch = e_model(t_design_sat)
        if boiler_kg <= 0.0:
            steam_kg = 0.0
            boiler_temp = ambient
            pressure = sat_pressure_mpa(0.5)
        elif boiler_energy_mj <= e_switch:
            lo, hi = 0.0, t_design_sat
            for _ in range(60):
                mid = 0.5 * (lo + hi)
                if e_model(mid) < boiler_energy_mj:
                    lo = mid
                else:
                    hi = mid
            boiler_temp = 0.5 * (lo + hi)
            steam_kg = steam_vol(boiler_temp, boiler_kg)
            pressure = sat_pressure_mpa(max(0.5, boiler_temp))
        else:
            s_sw = steam_vol(t_design_sat, boiler_kg)
            steam_kg = s_sw
            pressure = p['design_pressure_mpa']
            extra_kj = (boiler_energy_mj - e_switch) * 1000.0
            boiler_temp = t_design_sat + extra_kj / max(1.0, s_sw * 2.1)
            if boiler_temp > 450.0:
                kept_kj = (450.0 - t_design_sat) * s_sw * 2.1
                cum['standby'] += (extra_kj - kept_kj) / 3600.0
                boiler_energy_mj = e_switch + kept_kj / 1000.0
                boiler_temp = 450.0

        load_effect = clamp(cond_backlog_kwh * 2.0, 0.0, 25.0)
        cond_target = clamp(ambient + 12.0 + load_effect, 35.0, 75.0)
        cond_temp += (cond_target - cond_temp) * (1.0 - math.exp(-2.0 * dt_h))

        transit_kwh = ((exhaust_kg + condenser_kg)
                       * liquid_enthalpy(cond_temp) / 3600.0)
        stored = ((boiler_energy_mj - boiler_energy0_mj) / 3.6
                  + cond_backlog_kwh + transit_kwh - transit0_kwh)
        residual = cum['solar'] - (cum['opt_loss'] + cum['rec_loss']
                                   + cum['gross'] + cum['cond']
                                   + cum['standby'] + stored)
        last = dict(
            t_h=t, dni_w_m2=dni, ambient_c=ambient,
            solar_elev_deg=sun['elevation_deg'], solar_azim_deg=sun['azimuth_deg'],
            p_solar_kw=p_solar, p_optical_kw=p_opt, p_heat_kw=p_heat,
            receiver_temp_c=rec_boiler_temp + (min(80.0, p_heat * 8.0) if dni > 0 else 0.0),
            boiler_temp_c=rec_boiler_temp, boiler_pressure_mpa=rec_pressure,
            sat_temp_c=tsat, superheat_c=superheat, steam_kg=steam_kg,
            boiler_kg=boiler_kg, exhaust_kg=exhaust_kg, condenser_kg=condenser_kg,
            total_water_kg=boiler_kg + exhaust_kg + condenser_kg,
            boiler_enthalpy_flow_kw=turb_flow * h_boiler / 3600.0,
            reynolds=reynolds, diodicity=diod, valve_dp_pa=valve_dp,
            turbine_flow_kg_h=turb_flow, bypass_flow_kg_h=bypass_flow,
            reverse_leak_kg_h=bypass_flow,
            flow_direction=(1 if turb_flow > 0.0 else
                            (-1 if (return_kg > 0.0 or condensed_kg > 0.0) else 0)),
            turbine_inlet_mpa=inlet_p, enthalpy_drop_kj_kg=enth_drop,
            p_shaft_kw=p_shaft, rpm=rpm, p_gross_kw=p_gross, p_pump_kw=p_pump,
            p_parasitic_kw=p_par, p_net_kw=p_net, condenser_temp_c=cond_temp,
            p_condenser_kw=p_reject, condensed_kg_h=condensed_kg / dt_h,
            return_kg_h=return_kg / dt_h,
            cum_solar_kwh=cum['solar'], cum_optical_kwh=cum['opt'],
            cum_heat_kwh=cum['heat'], cum_enthalpy_kwh=cum['enth'],
            cum_shaft_kwh=cum['shaft'], cum_gross_kwh=cum['gross'],
            cum_net_kwh=cum['net'], cum_condenser_kwh=cum['cond'],
            cum_optical_loss_kwh=cum['opt_loss'],
            cum_receiver_loss_kwh=cum['rec_loss'],
            cum_standby_loss_kwh=cum['standby'], stored_kwh=stored,
            balance_residual_kwh=residual)
        if collect_steps:
            steps.append(last)
    result = dict(hours=total_h, total_solar_kwh=cum['solar'],
                  total_heat_kwh=cum['heat'], total_gross_kwh=cum['gross'],
                  total_net_kwh=cum['net'], total_condenser_kwh=cum['cond'],
                  peak_net_kw=peak_net, peak_gross_kw=peak_gross,
                  water_start_kg=water_start,
                  water_end_kg=last.get('total_water_kg', water_start),
                  balance_residual_kwh=last.get('balance_residual_kwh', 0.0),
                  steps=steps)
    result['water_delta_kg'] = result['water_end_kg'] - water_start
    return result


def fnv1a64(s):
    h = 1469598103934665603
    for ch in s.encode():
        h ^= ch
        h = (h * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return format(h, '016x')


def summary_string(r, scenario, load, rev):
    return ("%s|load=%.3f|rev=%d|hours=%.2f|solar=%.4f|heat=%.4f|gross=%.4f|"
            "net=%.4f|cond=%.4f|peaknet=%.4f|water=%.4f->%.4f|resid=%.4f"
            % (scenario, load, 1 if rev else 0, r['hours'],
               r['total_solar_kwh'], r['total_heat_kwh'], r['total_gross_kwh'],
               r['total_net_kwh'], r['total_condenser_kwh'], r['peak_net_kw'],
               r['water_start_kg'], r['water_end_kg'],
               r['balance_residual_kwh']))


def scenario_weather(name, p):
    """Mirror of the C++ scenario definitions (parity depends on this)."""
    w = [(0.0, 15.0)] * 24
    if name in ('night-only', 'zero-control'):
        p['start_day_of_year'] = 172
        return [(0.0, 15.0) for _ in range(24)]
    doy, peak, expo, mean, amp = 172, 950.0, 1.15, 31.0, 5.0
    if name == 'winter-clear':
        doy, peak, expo, mean, amp = 355, 520.0, 1.20, 8.0, 6.0
    if name == 'book-design-day':
        doy, peak, expo, mean, amp = 135, 950.0, 1.15, 28.0, 5.0
    p['start_day_of_year'] = doy
    decl_deg = -23.44 * math.cos(2.0 * PI * (doy + 10) / 365.0)
    lat = p['latitude'] * PI / 180.0
    decl = decl_deg * PI / 180.0
    cosH = clamp(-math.tan(lat) * math.tan(decl), -1.0, 1.0)
    daylen = 2.0 * math.acos(cosH) * 180.0 / PI / 15.0
    sunrise = 12.0 - daylen / 2.0
    raw = []
    amb = []
    for h in range(24):
        sp = solar_position(doy, h + 0.5, p['latitude'], p['longitude'])
        lst = h + 0.5 + p['longitude'] / 15.0 + sp['equation_time_min'] / 60.0
        while lst < sunrise - 12.0:
            lst += 24.0
        while lst >= sunrise + 12.0:
            lst -= 24.0
        shape = math.sin(PI * (lst - sunrise) / daylen)
        raw.append(math.pow(shape, expo) if shape > 0 else 0.0)
        amb.append(mean - amp * math.cos(2.0 * PI * (lst - 15.0) / 24.0))
    if name == 'book-design-day':
        scale = 5500.0 / sum(raw)
        return [(raw[h] * scale, amb[h]) for h in range(24)]
    return [(raw[h] * peak, amb[h]) for h in range(24)]
