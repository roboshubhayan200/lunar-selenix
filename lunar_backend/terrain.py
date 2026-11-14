"""Terrain-aware horizon profiles from LOLA DEM rasters.

Reads a LOLA DEM GeoTIFF, casts 720 rays from a site outward, and
records the highest terrain angle in each direction.
"""

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

from .constants import MOON_RADIUS_KM


_R_M = MOON_RADIUS_KM * 1000.0

DEFAULT_N_AZ = 720           # Every 0.5 degrees
DEFAULT_MAX_RANGE_M = 100_000.0  # 100 km
DEFAULT_STEP_M = 5.0         # Match DEM resolution


@dataclass(frozen=True)
class HorizonProfile:
    """A 360-degree terrain horizon profile for one site."""
    site_name: str
    lat_deg: float
    lon_deg: float
    azimuths_deg: np.ndarray    # shape (n_az,)
    horizon_deg: np.ndarray     # shape (n_az,)
    max_range_m: float
    dem_resolution_m: float


# ---------------------------------------------------------------------------
# Coordinate transforms — polar stereographic
# ---------------------------------------------------------------------------

def latlon_to_stereo(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    """Convert selenographic (lat, lon) to south polar stereographic (x, y).

    rho = 2R × tan(π/4 + lat/2)    ← lat is negative for south
    x = rho × sin(lon)
    y = rho × cos(lon)
    """
    lat_r = math.radians(lat_deg)
    lon_r = math.radians(lon_deg)

    rho = 2.0 * _R_M * math.tan(math.pi / 4.0 + lat_r / 2.0)

    x = rho * math.sin(lon_r)
    y = rho * math.cos(lon_r)

    return x, y


def stereo_to_latlon(x: float, y: float) -> tuple[float, float]:
    """Inverse: south polar stereographic (x, y) to (lat, lon)."""
    rho = math.sqrt(x * x + y * y)

    if rho < 1e-10:
        return -90.0, 0.0

    lat_r = -math.pi / 2.0 + 2.0 * math.atan2(rho, 2.0 * _R_M)
    lon_r = math.atan2(x, y)

    return math.degrees(lat_r), math.degrees(lon_r)


# ---------------------------------------------------------------------------
# DEM reader
# ---------------------------------------------------------------------------

def read_dem(dem_path: str | Path) -> tuple[np.ndarray, dict]:
    """Read a LOLA DEM GeoTIFF. Returns (elevation_array, metadata_dict).

    Requires: pip install rasterio
    """
    # pyrefly: ignore[missing-import]
    import rasterio

    with rasterio.open(str(dem_path)) as src:
        elev = src.read(1).astype(np.float64)

        t = src.transform
        transform = (t.a, t.b, t.c, t.d, t.e, t.f)
        resolution_m = abs(t.a)
        nodata = src.nodata

        meta = {
            "transform": transform,
            "crs": str(src.crs),
            "nodata": nodata,
            "resolution_m": resolution_m,
            "shape": elev.shape,
        }

    if nodata is not None:
        elev[elev == nodata] = np.nan

    return elev, meta


def xy_to_pixel(x: float, y: float, transform: tuple) -> tuple[int, int]:
    """Convert projected (x, y) to pixel (col, row)."""
    a, b, c, d, e, f = transform
    det = a * e - b * d
    col = (e * (x - c) - b * (y - f)) / det
    row = (a * (y - f) - d * (x - c)) / det
    return int(round(col)), int(round(row))


def pixel_to_xy(col: int, row: int, transform: tuple) -> tuple[float, float]:
    """Convert pixel (col, row) to projected (x, y). Uses pixel centre."""
    a, b, c, d, e, f = transform
    x = a * (col + 0.5) + b * (row + 0.5) + c
    y = d * (col + 0.5) + e * (row + 0.5) + f
    return x, y


# ---------------------------------------------------------------------------
# Ray-casting horizon computation
# ---------------------------------------------------------------------------

def _elevation_angle(obs_x, obs_y, obs_z, tgt_x, tgt_y, tgt_z):
    """Elevation angle from observer to terrain point, with curvature correction.

    curvature_drop = d² / (2R)
    At 10 km on Moon: ~29m drop. At 50 km: ~719m drop.
    """
    dx = tgt_x - obs_x
    dy = tgt_y - obs_y
    horiz = math.sqrt(dx * dx + dy * dy)

    if horiz < 0.1:
        return 0.0

    dz = tgt_z - obs_z
    curvature_drop = (horiz * horiz) / (2.0 * _R_M)
    apparent_dz = dz - curvature_drop

    return math.degrees(math.atan2(apparent_dz, horiz))


def compute_horizon(
    elev: np.ndarray,
    meta: dict,
    lat_deg: float,
    lon_deg: float,
    observer_height_m: float = 2.0,
    n_az: int = DEFAULT_N_AZ,
    max_range_m: float = DEFAULT_MAX_RANGE_M,
    step_m: Optional[float] = None,
    site_name: str = "unnamed",
) -> HorizonProfile:
    """Compute a 360-degree terrain horizon profile from a DEM.

    Ray-casting algorithm:
    1. Convert observer (lat, lon) to stereo (x, y)
    2. Read observer's surface elevation from DEM, add height
    3. For each azimuth (720 directions):
       a. Walk outward in step_m increments
       b. At each step: look up DEM elevation, compute angle with curvature
       c. Track maximum angle = terrain horizon in that direction
    4. Return the profile

    Performance: 720 rays × 100km / 5m = 14.4M lookups ≈ 2-5 seconds.
    """
    transform = meta["transform"]
    dem_res = meta["resolution_m"]
    rows, cols = meta["shape"]

    if step_m is None:
        step_m = dem_res

    obs_x, obs_y = latlon_to_stereo(lat_deg, lon_deg)
    obs_col, obs_row = xy_to_pixel(obs_x, obs_y, transform)

    if not (0 <= obs_row < rows and 0 <= obs_col < cols):
        raise ValueError(
            f"Observer at ({lat_deg}, {lon_deg}) is outside the DEM."
        )

    obs_surface_z = elev[obs_row, obs_col]
    if np.isnan(obs_surface_z):
        raise ValueError(
            f"Observer at ({lat_deg}, {lon_deg}) maps to a no-data pixel."
        )

    obs_z = obs_surface_z + observer_height_m

    azimuths = np.linspace(0.0, 360.0, n_az, endpoint=False)
    horizon = np.zeros(n_az)
    n_steps = int(max_range_m / step_m)

    for i, az_deg in enumerate(azimuths):
        az_rad = math.radians(az_deg)
        dx = math.sin(az_rad) * step_m   # az 0=north=+y, 90=east=+x
        dy = math.cos(az_rad) * step_m

        max_el = -90.0
        rx, ry = obs_x, obs_y

        for _ in range(n_steps):
            rx += dx
            ry += dy

            c = int(round((rx - transform[2]) / transform[0] - 0.5))
            r = int(round((ry - transform[5]) / transform[4] - 0.5))

            if r < 0 or r >= rows or c < 0 or c >= cols:
                break

            z = elev[r, c]
            if np.isnan(z):
                continue

            horiz_dist = math.sqrt((rx - obs_x) ** 2 + (ry - obs_y) ** 2)
            dz = z - obs_z
            curvature_drop = (horiz_dist * horiz_dist) / (2.0 * _R_M)
            apparent_dz = dz - curvature_drop

            el_deg = math.degrees(math.atan2(apparent_dz, horiz_dist))

            if el_deg > max_el:
                max_el = el_deg

        horizon[i] = max_el

    return HorizonProfile(
        site_name=site_name,
        lat_deg=lat_deg,
        lon_deg=lon_deg,
        azimuths_deg=azimuths,
        horizon_deg=horizon,
        max_range_m=max_range_m,
        dem_resolution_m=dem_res,
    )


# ---------------------------------------------------------------------------
# Profile I/O
# ---------------------------------------------------------------------------

def save_profile(profile: HorizonProfile, path: str | Path) -> None:
    """Save a horizon profile to CSV."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with open(path, "w") as f:
        f.write(f"# Site: {profile.site_name}\n")
        f.write(f"# Latitude: {profile.lat_deg}\n")
        f.write(f"# Longitude: {profile.lon_deg}\n")
        f.write(f"# Max range: {profile.max_range_m} m\n")
        f.write(f"# DEM resolution: {profile.dem_resolution_m} m\n")
        f.write(f"# Rays: {len(profile.azimuths_deg)}\n")
        f.write("azimuth_deg,horizon_deg\n")
        for az, hz in zip(profile.azimuths_deg, profile.horizon_deg):
            f.write(f"{az:.4f},{hz:.6f}\n")


def load_profile(path: str | Path) -> HorizonProfile:
    """Load a horizon profile from CSV."""
    path = Path(path)
    header = {}

    with open(path) as f:
        for line in f:
            if line.startswith("# "):
                key, _, val = line[2:].strip().partition(": ")
                header[key.strip()] = val.strip()
            elif line.startswith("azimuth_deg"):
                break

    data = np.loadtxt(path, delimiter=",", skiprows=len(header) + 1)

    return HorizonProfile(
        site_name=header.get("Site", "unknown"),
        lat_deg=float(header.get("Latitude", 0)),
        lon_deg=float(header.get("Longitude", 0)),
        azimuths_deg=data[:, 0],
        horizon_deg=data[:, 1],
        max_range_m=float(header.get("Max range", "100000").split()[0]),
        dem_resolution_m=float(header.get("DEM resolution", "5").split()[0]),
    )


# ---------------------------------------------------------------------------
# Integration with visibility
# ---------------------------------------------------------------------------

def horizon_at_azimuth(profile: HorizonProfile, az_deg: float) -> float:
    """Interpolate terrain horizon elevation at a given azimuth."""
    az = az_deg % 360.0
    return float(np.interp(az, profile.azimuths_deg, profile.horizon_deg, period=360.0))


def horizon_array(profile: HorizonProfile, az_array: np.ndarray) -> np.ndarray:
    """Vectorised: look up terrain horizon for an array of azimuths."""
    az = az_array % 360.0
    return np.interp(az, profile.azimuths_deg, profile.horizon_deg, period=360.0)