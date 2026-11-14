"""Low-level client for the JPL Horizons API.

The Horizons System (https://ssd.jpl.nasa.gov/horizons/) is one of the
four official resources for the NASA Space Apps 2027 "Lunar Landing Site
Navigator" challenge.  It computes ephemeris data — positions of the Sun
and Earth as seen from any point on the Moon — on JPL's servers.

Why Horizons instead of SPICE?
------------------------------
SPICE is a powerful toolkit, but it requires downloading hundreds of
megabytes of kernel files and installing the SpiceyPy wrapper.  The
competition resources page lists the **Horizons System** — not SPICE —
so we use Horizons as our primary ephemeris engine.

Advantages of Horizons for this project:
  1. No kernel downloads — just HTTP requests.
  2. No binary dependencies — works with pure Python + requests.
  3. Same underlying JPL ephemerides as SPICE (DE440).
  4. The API can compute topocentric azimuth/elevation DIRECTLY —
     we don't need to implement the maths ourselves.

API endpoint
------------
  GET https://ssd.jpl.nasa.gov/api/horizons.api

Key parameters (all wrapped in single quotes when sent):
  COMMAND     = '10' (Sun) or '399' (Earth)
  CENTER      = 'coord@301'    → observer at custom coordinates on Moon
  COORD_TYPE  = 'GEODETIC'     → coordinates are (lon, lat, alt)
  SITE_COORD  = 'lon,lat,0'   → east-longitude first, then latitude,
                                  altitude in km (0 = on reference sphere)
  EPHEM_TYPE  = 'OBSERVER'     → we want sky positions
  START_TIME  = '2027-06-01'
  STOP_TIME   = '2027-06-30'
  STEP_SIZE   = '30 m'         → one row every 30 minutes
  QUANTITIES  = '4,13,20'      → 4 = azimuth/elevation
                                  13 = angular diameter
                                  20 = observer range
  ANG_FORMAT  = 'DEG'          → decimal degrees (not deg-min-sec)
  CSV_FORMAT  = 'YES'          → comma-separated (easy to parse)
  APPARENT    = 'AIRLESS'      → no atmosphere on the Moon
  OBJ_DATA    = 'NO'           → skip the physical-data block

Response format
---------------
The response (format='json') has a "result" field containing a big text
string.  The actual data rows sit between two markers:
  $$SOE   (Start Of Ephemeris)
  $$EOE   (End Of Ephemeris)

With CSV_FORMAT='YES' and QUANTITIES='4,13,20', each row looks like:
  2027-Jun-01 00:00, ,  123.456,  12.789,  1961.234,  0.98765, -0.12345,

The columns are:
  0: Date/Time (UT)
  1: Solar presence flag (blank, *, C, N, A, etc.)
  2: Azimuth (deg) — clockwise from north
  3: Elevation (deg) — positive = above horizon
  4: Angular diameter (arcsec)
  5: Delta (distance from observer, in AU)
  6: Deldot (range rate, km/s) — we don't need this

Engineering practices
---------------------
1. **Cache every response** on disk, keyed by a SHA-256 hash of the
   parameters. You'll rerun tests many times; JPL should get each
   unique request only once.
2. **Be polite**: one request at a time, reasonable timeout, a clear
   User-Agent header identifying your project.
3. **Fail loudly**: if $$SOE is missing, raise with the first lines of
   the response — that's where Horizons explains what went wrong.
4. **Test the parser offline** with a saved response file, so unit
   tests pass without internet.
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import requests


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Default cache directory (relative to project root)
DEFAULT_CACHE_DIR = Path("data/cache/horizons")

# Target body IDs used by JPL Horizons
#   These come from the IAU Minor Planet Center numbering:
#   10 = Sun,  399 = Earth (3rd planet, 99 = planet center)
TARGET_SUN   = "10"
TARGET_EARTH = "399"


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_key(params: dict) -> str:
    """Create a unique filename from the request parameters.

    How it works
    ------------
    1. Sort the parameter dict so the same params always produce the
       same string, regardless of insertion order.
    2. Convert to a JSON string (deterministic because sorted).
    3. Hash with SHA-256 — a 64-hex-character digest.
    4. Truncate to 16 characters (still practically collision-free).

    Why hash instead of using the params as a filename?
    ---------------------------------------------------
    Parameters contain special characters (spaces, quotes, slashes).
    A hash gives a short, filesystem-safe name guaranteed unique per
    unique parameter set.
    """
    canonical = json.dumps(params, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def _read_cache(params: dict, cache_dir: Path) -> Optional[str]:
    """Try to load a cached response for these parameters.

    Returns None if no cached file exists. The cache is keyed by the
    SHA-256 hash of the parameter dictionary, so identical requests
    always hit the same cache file.
    """
    key = _cache_key(params)
    path = cache_dir / f"{key}.json"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def _write_cache(params: dict, response_text: str, cache_dir: Path) -> None:
    """Save a response to the cache.

    Creates the cache directory and any parent directories if they
    don't exist (parents=True, exist_ok=True).
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = _cache_key(params)
    path = cache_dir / f"{key}.json"
    path.write_text(response_text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def parse_rows(result_text: str) -> list[dict]:
    """Extract data rows from a Horizons result string.

    Parameters
    ----------
    result_text : str
        The value of the 'result' field from the Horizons JSON response.
        This is a multi-line string containing headers, the data table
        between $$SOE and $$EOE markers, and footer text.

    Returns
    -------
    list of dict
        Each dict has:
          utc_str        — "2027-Jun-01 00:00"
          az_deg         — float, azimuth in degrees (0=N, 90=E)
          el_deg         — float, elevation in degrees
          ang_diam_arcsec — float, angular diameter in arcseconds
          distance_au    — float, observer-target distance in AU

    How the parsing works
    ---------------------
    1. Find $$SOE (Start Of Ephemeris). Everything before = headers.
    2. Find $$EOE (End Of Ephemeris). Everything after = footer.
    3. Lines between them are data rows.
    4. Each row is comma-separated (CSV_FORMAT='YES').
       Split on commas and extract:
         col 0: date/time string
         col 1: solar presence flag (we skip this)
         col 2: azimuth in degrees
         col 3: elevation in degrees
         col 4: angular diameter in arcseconds
         col 5: distance (delta) in AU
         col 6: range rate (we skip this)
    5. Convert numeric strings to floats.
    6. Skip any malformed rows rather than crashing.

    Raises
    ------
    ValueError
        If $$SOE or $$EOE markers are not found. This means Horizons
        returned an error message instead of data.
    """
    # --- Step 1-2: Find the data block between markers ---
    soe = result_text.find("$$SOE")
    eoe = result_text.find("$$EOE")

    if soe == -1 or eoe == -1:
        # Horizons returned an error. Show the first 500 chars to help debug.
        snippet = result_text[:500]
        raise ValueError(
            f"Horizons response has no $$SOE/$$EOE markers. "
            f"First 500 chars:\n{snippet}"
        )

    # --- Step 3: Extract lines between markers ---
    data_block = result_text[soe:eoe]
    lines = data_block.strip().split("\n")
    lines = lines[1:]  # first line is "$$SOE" itself

    # --- Step 4-6: Parse each row ---
    rows: list[dict] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        parts = line.split(",")

        # We need at least 7 columns (indices 0..6)
        # Live Horizons outputs TWO flag columns for lunar surface observers
        # (CENTER='coord@301'): a solar-presence flag and a target-presence
        # flag between the timestamp and the numeric data.
        # Layout: Date, <solar_flag>, <target_flag>, Azi, Elev, Ang-diam, delta, ...
        if len(parts) < 7:
            continue

        # Column 0: date/time string
        time_str = parts[0].strip()

        # Columns 3-6: numeric values (shifted +1 for the two flag columns)
        try:
            az  = float(parts[3].strip())
            el  = float(parts[4].strip())
            ang = float(parts[5].strip())
            dist = float(parts[6].strip())
        except (ValueError, IndexError):
            continue  # skip rows with non-numeric data

        rows.append({
            "utc_str":          time_str,
            "az_deg":           az,
            "el_deg":           el,
            "ang_diam_arcsec":  ang,
            "distance_au":      dist,
        })

    if not rows:
        raise ValueError(
            "Parsed 0 valid Horizons rows. The CSV may have an unexpected "
            "column layout or all rows were filtered out."
        )

    return rows


# ---------------------------------------------------------------------------
# Query builder
# ---------------------------------------------------------------------------

def _build_params(
    target: str,
    lat_deg: float,
    lon_deg: float,
    alt_km: float,
    start: str,
    stop: str,
    step: str,
) -> dict:
    """Build the Horizons API parameter dictionary.

    This is separated from fetch() so we can test parameter construction
    independently from network calls.

    Parameters
    ----------
    target : str
        Body ID: '10' for Sun, '399' for Earth.
    lat_deg : float
        Selenographic latitude in degrees (positive north).
    lon_deg : float
        Selenographic east longitude in degrees.
    alt_km : float
        Observer altitude above the reference sphere, in km.
        For a 2 m mast: 0.002 km.
    start : str
        Start of time window, e.g. '2027-06-01'.
    stop : str
        End of time window, e.g. '2027-06-30'.
    step : str
        Step size, e.g. '30 m' for every 30 minutes, '1 h' for hourly.

    Returns
    -------
    dict
        Ready to pass as query parameters to requests.get().

    CRITICAL: SITE_COORD order
    --------------------------
    Horizons wants SITE_COORD as "east_longitude, latitude, altitude_km".
    Note: LONGITUDE FIRST, then latitude.  This is the opposite of the
    common (lat, lon) convention!  If you swap them, Horizons computes
    for the wrong location with NO warning.
    """
    site_coord = f"{lon_deg},{lat_deg},{alt_km}"

    return {
        "format":      "json",
        "COMMAND":     f"'{target}'",
        "CENTER":      "'coord@301'",
        "COORD_TYPE":  "'GEODETIC'",
        "SITE_COORD":  f"'{site_coord}'",
        "EPHEM_TYPE":  "'OBSERVER'",
        "START_TIME":  f"'{start}'",
        "STOP_TIME":   f"'{stop}'",
        "STEP_SIZE":   f"'{step}'",
        "QUANTITIES":  "'4,13,20'",
        "ANG_FORMAT":  "'DEG'",
        "CSV_FORMAT":  "'YES'",
        "OBJ_DATA":    "'NO'",
        "APPARENT":    "'AIRLESS'",
        "RANGE_UNITS": "'AU'",
        "SUPPRESS_RANGE_RATE": "'NO'",
        "SKIP_DAYLT":  "'NO'",
        "EXTRA_PREC":  "'NO'",
    }


# ---------------------------------------------------------------------------
# Main fetch function
# ---------------------------------------------------------------------------

def fetch(
    target: str,
    lat_deg: float,
    lon_deg: float,
    alt_km: float = 0.002,
    start: str = "2027-06-01",
    stop: str = "2027-06-30",
    step: str = "30 m",
    cache_dir: Optional[Path] = None,
    timeout: float = 60.0,
) -> list[dict]:
    """Query JPL Horizons and return parsed ephemeris rows.

    This is the main entry point for the Horizons client. It handles
    parameter construction, caching, HTTP requests, and response parsing.

    Parameters
    ----------
    target : str
        Body ID. Use TARGET_SUN ('10') or TARGET_EARTH ('399').
    lat_deg : float
        Selenographic latitude in degrees (positive north).
    lon_deg : float
        Selenographic east longitude in degrees.
    alt_km : float
        Observer altitude above the reference sphere, in km.
        Default 0.002 (2 metres).
    start : str
        Start time, e.g. '2027-06-01'.
    stop : str
        End time, e.g. '2027-06-30'.
    step : str
        Step size, e.g. '30 m' (30 minutes), '1 h' (1 hour).
    cache_dir : Path or None
        Where to cache responses. Defaults to data/cache/horizons/.
    timeout : float
        HTTP request timeout in seconds.

    Returns
    -------
    list of dict
        Each dict has: utc_str, az_deg, el_deg, ang_diam_arcsec, distance_au.

    Raises
    ------
    requests.HTTPError
        If the server returns an error status code (4xx, 5xx).
    ValueError
        If the response cannot be parsed (missing $$SOE/$$EOE markers).

    How it works
    ------------
    1. Build the parameter dictionary (_build_params).
    2. Check the cache — if we've seen these exact params, return cached data.
    3. Send the GET request to the Horizons API.
    4. Cache the raw response for future runs.
    5. Parse the 'result' text to extract data rows (parse_rows).
    """
    if cache_dir is None:
        cache_dir = DEFAULT_CACHE_DIR

    # --- Step 1: Build parameters ---
    params = _build_params(target, lat_deg, lon_deg, alt_km, start, stop, step)

    # --- Step 2: Check cache ---
    cached = _read_cache(params, cache_dir)
    if cached is not None:
        data = json.loads(cached)
        return parse_rows(data["result"])

    # --- Step 3: Send GET request ---
    response = requests.get(
        HORIZONS_URL,
        params=params,
        timeout=timeout,
        headers={"User-Agent": "LunarNavigator/1.0 (NASA SpaceApps 2027)"},
    )
    response.raise_for_status()

    # --- Step 4: Cache ---
    _write_cache(params, response.text, cache_dir)

    # --- Step 5: Parse and return ---
    data = response.json()
    return parse_rows(data["result"])


# ---------------------------------------------------------------------------
# Convenience wrappers
# ---------------------------------------------------------------------------

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
    return fetch(TARGET_SUN, lat_deg, lon_deg, alt_km, start, stop, step, **kwargs)


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
    return fetch(TARGET_EARTH, lat_deg, lon_deg, alt_km, start, stop, step, **kwargs)


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
