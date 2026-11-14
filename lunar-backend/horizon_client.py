'''low level client file for the JPL horizons API'''

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import numpy as np
import requests


horizon_url = 'https://ssd.jpl.nasa.gov/api/horizons.api'

default_cache_dir = Path("data/cache/horizon")

sun_target = "10" #the horizon numerical code for the target as sun.

earth_target = "399"  #the horizon numerical code for the target as earth.

moon_target = "301"   #the horizon numerical code for the target as moon.

def _cache_key(params : dict) -> str:
    canonical = json.dumps(params, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigit()[:16]
    
def _read_cache(params: dict, cache_dir : Path) -> Optional[str]:
    key = _cache_key(params)
    path = cache_dir/f"{key}.json"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None

def _write_cache(params: dict, response_text: str, cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)   #here the syntax exists_ok = true is replacing the requirement of the if condition of path.exists();
    key = _cache_key(params)
    path = cache_dir/f"{key}.json"
    path.write_text(response_text, encoding="utf-8")

#### the parser document 
def parse_rows(result_text : str) -> list[dict] :
    soe = result_text.find("$$SOE")  #this are just the headers parameters and SOE= Start of Ephemeris and similarly it's also a datetime variable.
    eoe = result_text.find("$$EOE")  #this is also a similar kind of header and EOE= End of Ephemeris and it's a datetime variable

    if soe == -1 or eoe == -1:
        error_debug = result_text[:500]
        raise ValueError(
            "the response doesn't have SOE(Start of Ephemeris header) or EOE(End of Ephemeris) headers."
            "the first 500 chars of the error : ", error_debug
        )

    data_block = result_text[soe:eoe]  #it is giving the response text from the start of ephemeris upto the end of the ephemeris
    lines = data_block.strip().split("\n")
    lines = lines[1:]  #the very first line of End of Ephemeris itself.

    rows : list[dict] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        parts = line.split(',')

        if len(parts) < 7:
            continue

        time_str = parts[0].strip()  #this is the main datetime string which is returned at the very first step in the response_text.

        try:
            az = float(parts[3].strip())
            el = float(parts[4].strip())
            ang = float(parts[5].strip())  #this is the storing the value of the angular diameter of the target object
            dist = float(parts[6].strip())  #this is storing the value of the distance in the astronomical unit of the target object from the moon_center.
            delta_dot = float(parts[7].strip())  #this is not at all needed in the project building of the Lunar site navigator.


        except (ValueError, IndexError):
            continue

        rows.append({
            "utc_to_str" : time_str,
            "az_deg" : az,
            "ele_deg" : el,
            "angular_diameter" : ang,  #this is the angular diameter of the target either it is sun or earth.
            "au_dist" : dist  #this is also the astronomical distance from the moon_surface to the target_body.
        })

        if not rows:
            raise ValueError(
                "Parsed 0 Horizon API rows. The CSV may have been unexpected."
            )

        return rows

# the main query building phase :

def _build_params(target :str, lat:float, lon: float, alt_km : float, start: str, stop: str, step: str) -> dict:

    site_coord = f"{lon},{lat},{alt_km}"

    return {
        "format" : "json",
        "COMMAND" : f"'{target}'",
        "CENTER" : "'coord@301'",
        "COORD_TYPE" : "GEODENTIC",
        "SITE_COORD" : f"'{site_coord}'",
        "EPHEM_TYPE" : "'OBSERVER'",
        "START_TIME" : f"'{start}'",
        "STOP_TIME" : f"'{stop}'",
        "STEP_SIZE" : f"'{step}'",
        "QUANTITIES" : "'4,13,20'",
        "AMG_FORMAT" : "'DEG",
        "CSV_FORMAT" : "'YES'",
        "OBJ_DATA" : "'NO'",
        "APPARENT" : "'AIRLESS'",
        "RANGE_UNITS" : "'AU'",
        "SUPRESS_RANGE_RATE" : "'NO'",
        "SKIP_DAYLT" : "'NO'",
        "EXTRA_PREC" : "'NO'",
    }

def fetch(target : str, lat: float, lon: float, alt_km: float, start: str ='2026-11-14', stop: str = '2026-11-30', step: str = '30 m', timeout: float = 60.0, cache_dir : Optional[Path] = None) -> list[dict]:

    if cache_dir is None:
        cache_dir = default_cache_dir

    #building required parameters
    params = _build_params(target, lat, lon, alt_km, start, stop, step)

    cached = _read_cache(params, cache_dir)
    if cached is not None:
        data = json.loads(cached)
        return parse_rows(data["result"])

    #building to send the exact GET request to the required Horizon API server
    response = requests.get(horizon_url, params=params, timeout=timeout, headers={"User-Agent": "Lunar Navigator (Nasa Space Apps Challenge 2026)."})
    response.raise_for_status()

    #cache the response got from the horizon API

    _write_cache(params, response.text, cache_dir)

    #finally parsing the file and returning the required output

    data = response.json()
    return parse_rows(data["result"])


def fetch_sun(
    lat_deg: float,
    lon_deg: float,
    start: str = "2027-06-01",
    stop: str = "2027-06-30",
    step: str = "30 m",
    alt_km: float = 0.002,
    **kwargs,
) -> list[dict]:
    """Fetch Sun ephemeris from a lunar surface point.

    Convenience wrapper around fetch() that sets target=TARGET_SUN.
    All other parameters are passed through.
    """
    return fetch(sun_target, lat_deg, lon_deg, alt_km, start, stop, step, **kwargs)


def fetch_earth(
    lat_deg: float,
    lon_deg: float,
    start: str = "2027-06-01",
    stop: str = "2027-06-30",
    step: str = "30 m",
    alt_km: float = 0.002,
    **kwargs,
) -> list[dict]:
    """Fetch Earth ephemeris from a lunar surface point.

    Convenience wrapper around fetch() that sets target=TARGET_EARTH.
    All other parameters are passed through.
    """
    return fetch(earth_target, lat_deg, lon_deg, alt_km, start, stop, step, **kwargs)


# ---------------------------------------------------------------------------
# Structured result builder
# ---------------------------------------------------------------------------

def rows_to_arrays(rows: list[dict]) -> dict[str, np.ndarray]:
    """Convert a list of parsed row dicts into NumPy arrays.

    Parameters
    ----------
    rows : list of dict
        Output of fetch() or parse_rows().

    Returns
    -------
    dict with numpy arrays:
        az_deg          — azimuth at each timestep (degrees)
        el_deg          — elevation at each timestep (degrees)
        distance_au     — observer-target distance (AU)
        ang_diam_deg    — angular diameter (degrees, converted from arcsec)
        utc_strings     — array of date/time strings

    Why convert to arrays?
    ----------------------
    Lists of dicts are easy to inspect and test.  But for numerical
    computation (disk fraction, irradiance, energy integration), NumPy
    arrays are 100x faster because operations run in compiled C code
    rather than Python loops.
    """
    az  = np.array([r["az_deg"]  for r in rows])
    el  = np.array([r["el_deg"]  for r in rows])
    dist = np.array([r["distance_au"] for r in rows])
    ang  = np.array([r["ang_diam_arcsec"] for r in rows]) / 3600.0  # arcsec → deg

    utc_strs = np.array([r["utc_str"] for r in rows])

    return {
        "az_deg":       az,
        "el_deg":       el,
        "distance_au":  dist,
        "ang_diam_deg": ang,
        "utc_strings":  utc_strs,
    }


def parse_utc_strings(utc_strings: np.ndarray) -> np.ndarray:
    """Parse Horizons date strings into Python datetime objects.

    Parameters
    ----------
    utc_strings : numpy array of str
        Date strings like "2027-Jun-01 00:00".

    Returns
    -------
    numpy array of datetime objects (timezone-aware UTC)

    Horizons date formats
    ---------------------
    Depending on the TIME_DIGITS setting, Horizons can return:
      "2027-Jun-01 00:00"           (TIME_DIGITS='MINUTES')
      "2027-Jun-01 00:00:00.000"    (TIME_DIGITS='SECONDS')
    We try both formats to be safe.
    """
    fmts = ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S.%f", "%Y-%b-%d %H:%M:%S")
    result = []

    for s in utc_strings:
        s = s.strip()
        parsed = None
        for fmt in fmts:
            try:
                parsed = datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue
        result.append(parsed)

    return np.array(result, dtype=object)