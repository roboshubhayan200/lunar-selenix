"""Sun/Earth visibility, solar power, and operational metrics for one site.

This is the payoff module. The Horizons client gives us positions.  Now
we turn those positions into the answers mission planners actually care
about:

  - Is the Sun up? (power available)
  - Is Earth in view? (communications possible)
  - How much solar power can we collect?
  - How long is the longest night? (battery sizing)
  - How long is the longest comms gap? (data storage sizing)

What changed in the Horizons rewire
------------------------------------
The LOGIC in this module is unchanged from the original SPICE version.
What changed is WHERE the Sun/Earth positions come from:

  BEFORE (SPICE):
    1. Import utc_to_et, body_vectors from ephemeris.py (SPICE)
    2. Import Site, az_el from topocentric.py (SPICE)
    3. Loop over timesteps, calling SPICE for each one
    4. Compute azimuth/elevation ourselves using local basis vectors

  AFTER (Horizons):
    1. Import get_timeline from ephemeris.py (Horizons)
    2. One call to get_timeline() returns ALL timesteps at once
    3. Horizons already computed azimuth/elevation for us
    4. We just use the arrays directly

The formulas for disk_fraction, irradiance, energy, etc. are identical.

Key modelling choices (each is a question a judge may ask)
----------------------------------------------------------
1. The Sun is a disk, NOT a point.
   It's about 0.53 deg wide. Near the pole it skims the horizon for hours.
   A sharp on/off switch would be wrong. We compute the visible FRACTION
   of the disk — from 0.0 (fully set) through 0.5 (half up) to 1.0.

2. "Sunlit" = more than half the disk visible (fraction > 0.5).
   With less than half the disk, you get very little usable power.

3. "Earth in view" = Earth's centre above the terrain horizon + margin.
   The margin accounts for antenna beam width and pointing uncertainty.

4. Power depends on panel orientation.
   - Vertical, Sun-tracking panel: power ∝ cos(elevation)
   - Flat panel on the ground: power ∝ sin(elevation)
   Near the pole, elevation is low, so vertical panels are much better.

Smooth-Moon horizon
-------------------
The Moon has no atmosphere. The horizon is purely geometric:
    dip = -arccos(R / (R + h))
For h = 2 m:  dip ≈ -0.087 deg.

Phase 6 terrain.py replaces this with real terrain data from the LOLA DEM
(accessed via Quickmap, another official resource), but the code here
doesn't change — it just takes a different horizon_deg value.

Usage
-----
    from lunarnav.visibility import timeline, summarise, battery_wh

    tl = timeline(
        lat_deg=-89.9, lon_deg=0.0,
        start="2027-06-01", stop="2027-06-30",
        step_min=30, height_m=2.0,
    )
    summary = summarise(tl, step_min=30.0)
    print(f"Sunlit {summary['sunlit_pct']:.1f}% of the time")
"""

import math

import numpy as np

from .constants import (
    MOON_RADIUS_KM,
    AU_KM,
    SOLAR_CONSTANT_W_M2,
    SUN_RADIUS_KM,
)
from .ephemeris import get_timeline


# Moon's radius in metres (for dip calculation)
_R_M = MOON_RADIUS_KM * 1000.0


# ---------------------------------------------------------------------------
# Disk fraction — the heart of polar-site solar modelling
# ---------------------------------------------------------------------------

def disk_fraction(center_el_deg: float, horizon_deg: float,
                  radius_deg: float) -> float:
    """What fraction of a circular disk (like the Sun) is above the horizon?

    Parameters
    ----------
    center_el_deg : float
        Elevation of the disk's centre above the local horizontal, degrees.
    horizon_deg : float
        Elevation of the horizon at the disk's azimuth, degrees.
        Negative for a smooth Moon (the horizon dips below 0 deg).
    radius_deg : float
        Angular radius of the disk, degrees.
        For the Sun at 1 AU: about 0.267 deg.

    Returns
    -------
    float
        Fraction of the disk area above the horizon, from 0.0 to 1.0.

    The maths
    ---------
    Define x = (centre_elevation - horizon) / radius.

    If x >= 1:  entire disk above horizon → 1.0
    If x <= -1: entire disk below horizon → 0.0

    Otherwise:
        f(x) = 1 - (arccos(x) - x * sqrt(1 - x²)) / π

    Verification (anchor points):
        f(1)  = 1 - 0/π = 1.0       ✓ fully up
        f(0)  = 1 - (π/2)/π = 0.5   ✓ half
        f(-1) = 1 - π/π = 0.0       ✓ fully set

    Symmetry: f(x) + f(-x) = 1  (visible + hidden = 1).

    Where does this formula come from?
    -----------------------------------
    A circle of radius 1 centred at (0,0). A horizontal line at height x
    cuts it. The area above the line, divided by π (total area), gives the
    formula. It's the area of a circular segment = arccos − triangle.
    """
    x = (center_el_deg - horizon_deg) / radius_deg

    if x >= 1.0:
        return 1.0
    if x <= -1.0:
        return 0.0

    return 1.0 - (math.acos(x) - x * math.sqrt(1.0 - x * x)) / math.pi


def disk_fraction_array(center_el: np.ndarray,
                        horizon: float | np.ndarray,
                        radius: np.ndarray) -> np.ndarray:
    """Vectorised version of disk_fraction for arrays of timesteps.

    Parameters
    ----------
    center_el : numpy array, shape (n,)
        Sun centre elevation at each timestep, degrees.
    horizon : float or numpy array, shape (n,)
        Horizon elevation in degrees. A scalar for smooth sphere, or a
        per-timestep array from directional terrain horizons.
    radius : numpy array, shape (n,)
        Sun angular radius at each timestep, degrees.

    Returns
    -------
    numpy array, shape (n,)
        Visible fraction at each timestep, clipped to [0, 1].

    Why a separate vectorised version?
    -----------------------------------
    The scalar version uses Python if/else and math.acos. With 1400+
    timesteps, calling it in a loop is slow. NumPy processes the entire
    array at once in compiled C — about 100x faster.
    """
    x = (center_el - horizon) / radius
    x_clip = np.clip(x, -1.0, 1.0)

    frac = 1.0 - (np.arccos(x_clip) - x_clip * np.sqrt(1.0 - x_clip**2)) / np.pi

    frac = np.where(x >= 1.0, 1.0, frac)
    frac = np.where(x <= -1.0, 0.0, frac)

    return frac


# ---------------------------------------------------------------------------
# Smooth-sphere horizon
# ---------------------------------------------------------------------------

def smooth_horizon_dip_deg(observer_height_m: float) -> float:
    """Horizon dip angle for a smooth Moon, in degrees.

    Parameters
    ----------
    observer_height_m : float
        Height of the observer above the surface, in metres.

    Returns
    -------
    float
        Dip angle in degrees. Always negative (horizon is below 0 deg).
        For height_m = 2.0: approximately -0.087 deg.

    The maths
    ---------
        dip = -arccos(R / (R + h))

    At the south pole, the Sun maxes out at about 1.5 degrees elevation.
    A dip of -0.087 degrees means about 20 extra minutes of sunlight
    compared to a naive "elevation > 0" check — significant for power.
    """
    if observer_height_m <= 0:
        return 0.0
    return -math.degrees(math.acos(_R_M / (_R_M + observer_height_m)))


# ---------------------------------------------------------------------------
# Timeline — the main computation
# ---------------------------------------------------------------------------

def timeline(
    lat_deg: float,
    lon_deg: float,
    start: str,
    stop: str,
    step_min: int = 30,
    height_m: float = 2.0,
    horizon_deg: float | None = None,
    earth_margin_deg: float = 0.5,
    terrain_profile=None,
    **client_kwargs,
) -> dict[str, np.ndarray]:
    """Compute Sun/Earth visibility and derived quantities over a time window.

    This is the main function of the visibility module. It calls the
    Horizons-based ephemeris to get positions, then computes power and
    communications metrics.

    Parameters
    ----------
    lat_deg : float
        Selenographic latitude in degrees.
    lon_deg : float
        Selenographic east longitude in degrees.
    start : str
        Start time, e.g. "2027-06-01".
    stop : str
        Stop time, e.g. "2027-06-30".
    step_min : int
        Time step in minutes. Default 30. Must be an integer ≥ 1.
    height_m : float
        Observer height above ground, in metres. Default 2.0.
    horizon_deg : float or None
        Horizon elevation in degrees (scalar, isotropic fallback).
        If None, computed automatically from height_m using the smooth-
        sphere approximation.
        If a float is given, it overrides — use a terrain-derived value
        from Phase 6 for more accuracy.
        Ignored when terrain_profile is provided (directional horizons
        are used instead).
    earth_margin_deg : float
        How far above the horizon Earth must be to count as "in view".
        Default 0.5 deg accounts for antenna beam width.
    terrain_profile : HorizonProfile or None
        If provided, use azimuth-dependent terrain horizons from
        terrain.horizon_array() instead of a scalar horizon_deg.
    **client_kwargs
        Extra arguments passed to ephemeris.get_timeline() and ultimately
        to horizon_client.fetch() — e.g. cache_dir, timeout.

    Returns
    -------
    dict with numpy arrays, all shape (n,):
        t_utc       — datetime objects for each timestep
        sun_az      — Sun azimuth (degrees, 0=N, 90=E)
        sun_el      — Sun elevation (degrees)
        sun_range_km — Sun distance (km)
        sun_frac    — visible fraction of the Sun's disk (0 to 1)
        earth_az    — Earth azimuth (degrees)
        earth_el    — Earth elevation (degrees)
        earth_range_km — Earth distance (km)
        earth_vis   — boolean, is Earth above horizon + margin?
        irradiance  — solar irradiance at surface, W/m², scaled by sun_frac

    How it works (step by step)
    ---------------------------
    1. Compute the horizon dip if not provided.
    2. Convert height_m to alt_km for the Horizons API.
    3. Call get_timeline() — this makes 2 Horizons requests (Sun + Earth)
       and returns all positions as NumPy arrays.
    4. The Sun angular radius comes directly from Horizons (it returned
       the angular diameter; get_timeline already halved it to radius).
    5. Compute disk_fraction for each timestep using the vectorised formula.
    6. Compute irradiance using the inverse-square law and disk fraction.
    7. Determine Earth visibility from elevation and margin.
    """
    # --- Step 0: Enforce integer step_min ---
    step_min = int(step_min)
    if step_min < 1:
        raise ValueError("step_min must be >= 1 minute.")

    # --- Step 1: Horizon dip (scalar fallback) ---
    if horizon_deg is None:
        horizon_deg = smooth_horizon_dip_deg(height_m)

    # --- Step 2: Height to altitude in km ---
    alt_km = height_m / 1000.0

    # --- Step 3: Get Horizons data ---
    # This is the KEY CHANGE from the SPICE version.
    # Instead of a loop calling SPICE for each timestep, we make ONE call
    # that returns ALL timesteps at once.
    eph = get_timeline(
        lat_deg=lat_deg,
        lon_deg=lon_deg,
        start=start,
        stop=stop,
        step_min=step_min,
        alt_km=alt_km,
        **client_kwargs,
    )

    # --- Step 4: Sun angular radius (already in degrees from get_timeline) ---
    sun_radius_deg = eph["sun_radius_deg"]

    # --- Step 5: Disk fraction ---
    # When a terrain_profile is provided, compute azimuth-dependent horizon
    # arrays for both Sun and Earth instead of using a single scalar.
    if terrain_profile is not None:
        from .terrain import horizon_array
        sun_hz  = horizon_array(terrain_profile, eph["sun_az"])
        earth_hz = horizon_array(terrain_profile, eph["earth_az"])
    else:
        sun_hz  = horizon_deg   # scalar — broadcast by NumPy
        earth_hz = horizon_deg

    sun_frac = disk_fraction_array(eph["sun_el"], sun_hz, sun_radius_deg)

    # --- Step 6: Irradiance ---
    # I = S × (1 AU / d)² × visible_fraction
    # where S = 1361 W/m² (solar constant at 1 AU), d = distance to Sun
    irradiance = (
        SOLAR_CONSTANT_W_M2
        * (AU_KM / eph["sun_range_km"]) ** 2
        * sun_frac
    )

    # --- Step 7: Earth visibility ---
    earth_vis = eph["earth_el"] > (earth_hz + earth_margin_deg)

    return {
        "t_utc":          eph["t_utc"],
        "sun_az":         eph["sun_az"],
        "sun_el":         eph["sun_el"],
        "sun_range_km":   eph["sun_range_km"],
        "sun_frac":       sun_frac,
        "earth_az":       eph["earth_az"],
        "earth_el":       eph["earth_el"],
        "earth_range_km": eph["earth_range_km"],
        "earth_vis":      earth_vis,
        "irradiance":     irradiance,
    }


# ---------------------------------------------------------------------------
# Analysis functions (UNCHANGED from the SPICE version)
# ---------------------------------------------------------------------------

def longest_run(flags: np.ndarray, step_h: float) -> float:
    """Find the longest consecutive run of True values, in hours.

    Parameters
    ----------
    flags : numpy array of bool
        Boolean array (e.g. "is it dark?" at each timestep).
    step_h : float
        Duration of each timestep in hours.

    Returns
    -------
    float
        Length of the longest consecutive True run, in hours.

    How it works
    ------------
    Walk through the array, counting consecutive True values.
    When we hit a False, reset the counter. Track the maximum.
    Multiply the maximum count by the step size to get hours.

    Why this matters
    ----------------
    - longest_run of "is_dark" → longest night → battery size
    - longest_run of "no_earth" → longest comms gap → data buffer size
    """
    best = 0
    current = 0
    for f in flags:
        if f:
            current += 1
            if current > best:
                best = current
        else:
            current = 0
    return best * step_h


def summarise(tl: dict, step_min: float) -> dict:
    """Compute summary statistics from a timeline.

    Parameters
    ----------
    tl : dict
        Output of timeline().
    step_min : float
        Time step in minutes (must match the step_min used in timeline).

    Returns
    -------
    dict with:
        sunlit_pct          — % of time with > 50% Sun disk visible
        earth_pct           — % of time Earth is in view
        both_pct            — % of time BOTH Sun and Earth are available
        longest_dark_h      — longest continuous night, hours
        longest_comms_gap_h — longest continuous period without Earth, hours
        longest_both_h      — longest continuous period with both
        max_sun_el          — highest Sun elevation reached, degrees
        energy_vert_kwh_m2  — energy on a vertical Sun-tracking panel
        energy_flat_kwh_m2  — energy on a flat horizontal panel

    Energy calculations
    -------------------
    VERTICAL, Sun-tracking panel:
        power = irradiance × cos(elevation)
    The panel faces the Sun. At low elevations (near horizon), a vertical
    panel catches most of the light.

    FLAT, horizontal panel:
        power = irradiance × sin(elevation)
    At 1° elevation, sin(1°) = 0.017 — just 1.7% efficiency!
    This is why polar missions mount panels vertically.

    Energy = Σ(power × step_hours) → Wh/m²  ÷ 1000 → kWh/m².
    """
    step_h = step_min / 60.0
    n = len(tl["sun_frac"])

    is_lit = tl["sun_frac"] > 0.5
    is_earth = tl["earth_vis"]
    is_both = is_lit & is_earth

    sunlit_pct = 100.0 * np.sum(is_lit) / n
    earth_pct  = 100.0 * np.sum(is_earth) / n
    both_pct   = 100.0 * np.sum(is_both) / n

    is_dark  = ~is_lit
    no_earth = ~is_earth

    longest_dark_h      = longest_run(is_dark, step_h)
    longest_comms_gap_h = longest_run(no_earth, step_h)
    longest_both_h      = longest_run(is_both, step_h)

    max_sun_el = float(np.max(tl["sun_el"]))

    sun_el_rad = np.radians(np.maximum(tl["sun_el"], 0.0))
    e_vert = np.sum(tl["irradiance"] * np.cos(sun_el_rad)) * step_h / 1000.0
    e_flat = np.sum(tl["irradiance"] * np.sin(sun_el_rad)) * step_h / 1000.0

    return {
        "sunlit_pct":          float(sunlit_pct),
        "earth_pct":           float(earth_pct),
        "both_pct":            float(both_pct),
        "longest_dark_h":      float(longest_dark_h),
        "longest_comms_gap_h": float(longest_comms_gap_h),
        "longest_both_h":      float(longest_both_h),
        "max_sun_el":          float(max_sun_el),
        "energy_vert_kwh_m2":  float(e_vert),
        "energy_flat_kwh_m2":  float(e_flat),
    }


def battery_wh(load_w: float, longest_dark_h: float,
               depth_of_discharge: float = 0.8) -> float:
    """How much battery capacity to survive the longest night?

    Parameters
    ----------
    load_w : float
        Average power consumption during the night, watts.
    longest_dark_h : float
        Duration of the longest night, hours (from summarise).
    depth_of_discharge : float
        Fraction of battery you're willing to use. Default 0.8 (80%).

    Returns
    -------
    float
        Required battery capacity in watt-hours (Wh).

    The maths
    ---------
        battery = load_w × longest_dark_h / depth_of_discharge

    Example: 100 W × 354 h ÷ 0.8 = 44,250 Wh = 44.25 kWh
    (about one Tesla Model 3 battery!)
    """
    return load_w * longest_dark_h / depth_of_discharge
