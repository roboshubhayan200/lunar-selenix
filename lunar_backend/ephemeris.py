"""High-level ephemeris interface — Sun and Earth positions from a lunar site.

ONE function that downstream code needs:
    get_timeline(lat, lon, start, stop, step_min)
        → dict of NumPy arrays: sun_az, sun_el, earth_az, earth_el, etc.
"""

from datetime import datetime, timezone

import numpy as np

from . import horizon_client as hc
from .constants import AU_KM, SUN_RADIUS_KM


def get_timeline(
    lat_deg: float,
    lon_deg: float,
    start: str,
    stop: str,
    step_min: int = 30,
    alt_km: float = 0.002,
    **client_kwargs,
) -> dict[str, np.ndarray]:
    """Get Sun and Earth ephemeris data for a lunar surface point.

    Makes TWO Horizons API calls (Sun + Earth), packages into one dict.

    Parameters
    ----------
    lat_deg, lon_deg : float — selenographic coordinates
    start, stop : str — time window, e.g. '2027-06-01', '2027-06-30'
    step_min : int — time step in minutes (default 30)
    alt_km : float — observer altitude in km (default 0.002 = 2 metres)

    Returns dict with NumPy arrays:
        t_utc, sun_az, sun_el, sun_range_au, sun_range_km,
        sun_radius_deg, earth_az, earth_el, earth_range_au, earth_range_km
    """
    # Step 1: Convert step to Horizons format ("30 m" for 30 minutes)
    step_str = f"{step_min} m"

    # Step 2: Fetch Sun data (one HTTP request)
    sun_rows = hc.fetch_sun(
        lat_deg=lat_deg, lon_deg=lon_deg,
        start=start, stop=stop, step=step_str,
        alt_km=alt_km, **client_kwargs,
    )

    # Step 3: Fetch Earth data (one HTTP request)
    earth_rows = hc.fetch_earth(
        lat_deg=lat_deg, lon_deg=lon_deg,
        start=start, stop=stop, step=step_str,
        alt_km=alt_km, **client_kwargs,
    )

    # Step 4: Convert to NumPy arrays
    sun   = hc.rows_to_arrays(sun_rows)
    earth = hc.rows_to_arrays(earth_rows)

    # Step 5: Parse timestamps (use Sun's — both are identical)
    t_utc = hc.parse_utc_strings(sun["utc_strings"])

    # Step 6: Sun angular radius = diameter / 2
    # (already in degrees from rows_to_arrays)
    sun_radius_deg = sun["ang_diam_deg"] / 2.0

    # Step 7: Convert AU to km
    sun_range_km   = sun["distance_au"] * AU_KM
    earth_range_km = earth["distance_au"] * AU_KM

    # Step 8: Package the result
    return {
        "t_utc":          t_utc,
        "sun_az":         sun["az_deg"],
        "sun_el":         sun["el_deg"],
        "sun_range_au":   sun["distance_au"],
        "sun_range_km":   sun_range_km,
        "sun_radius_deg": sun_radius_deg,
        "earth_az":       earth["az_deg"],
        "earth_el":       earth["el_deg"],
        "earth_range_au": earth["distance_au"],
        "earth_range_km": earth_range_km,
    }