"""Site comparison engine — rank candidate landing sites on objective criteria.

This module ties everything together. Earlier phases compute data for ONE
site.  This module runs those computations for MULTIPLE sites and produces
a side-by-side comparison table.

Why do we need this?
--------------------
The NASA Space Apps challenge isn't "compute Sun angles at one spot."
It's "help mission planners CHOOSE the best landing site." That means:
  1. Run the same analysis at every candidate site.
  2. Score each site on the criteria that matter.
  3. Rank them so a planner can pick the best one.

What makes a good landing site?
-------------------------------
Mission planners weigh several factors:

  Criterion                 Why it matters
  ─────────────────────────────────────────────────
  Sunlit percentage         More Sun = more power
  Longest night (hours)     Shorter night = smaller battery
  Earth visibility %        More Earth time = more comm windows
  Longest comms gap (hours) Shorter gap = less onboard data storage
  Max Sun elevation (deg)   Higher max = more peak power
  Energy per m² (kWh)       More energy = more science ops

  Terrain horizon max (deg) Lower max = fewer shadows
  Terrain horizon mean (deg)  Lower mean = more open sky

Each site gets a score from 0–100 on each criterion, then a
weighted total. The weights are configurable — different missions
care about different things. A solar-powered rover cares most about
sunlit percentage and energy. A relay station cares about Earth
visibility. A crewed habitat cares about ALL of them.

Design decisions
----------------
1. Scores are 0–100, where 100 = best among the candidates.
   Linear scaling: score = 100 × (value - worst) / (best - worst).

2. For "lower is better" criteria (longest night, comms gap, terrain
   horizon), we invert: score = 100 × (worst - value) / (worst - best).

3. Weights are normalised to sum to 1.0. The weighted total is always 0–100.

4. The comparison result is a list of dicts — easy to serialise as
   JSON for the API (api.py) or render in a frontend table.

What changed in the Horizons rewire
------------------------------------
The analyse_site() function no longer imports topocentric.Site.  Instead
it calls the rewired visibility.timeline() which takes (lat_deg, lon_deg)
directly and uses the Horizons API internally.  The old SPICE-dependent
import chain is gone.

Usage
-----
    from lunarnav.compare import compare_sites, SiteSpec, DEFAULT_WEIGHTS

    sites = [
        SiteSpec("Shackleton Rim", -89.9, 0.0, 2.0),
        SiteSpec("de Gerlache", -88.5, -86.5, 2.0),
        SiteSpec("Connecting Ridge", -89.4, 222.0, 2.0),
    ]

    result = compare_sites(
        sites,
        start_utc="2027-06-01",
        days=29.53,
        step_min=30.0,
        weights=DEFAULT_WEIGHTS,
    )

    for row in result["ranking"]:
        print(f"{row['name']:20s}  total={row['total_score']:.1f}")
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np


# ---------------------------------------------------------------------------
# SiteSpec — describes one candidate site
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SiteSpec:
    """Specification for a candidate landing site.

    Parameters
    ----------
    name : str
        Human-readable name (e.g. "Shackleton Rim").
    lat_deg : float
        Selenographic latitude in degrees. Negative = south.
    lon_deg : float
        Selenographic east longitude in degrees.
    height_m : float
        Observer height above the reference sphere, in metres.
        Default 2.0 (a mast or instrument on top of a lander).

    Why frozen?
    -----------
    frozen=True makes instances immutable. This prevents accidental mutation
    and makes the objects safe to use as dict keys or in sets.

    Why is this a plain data carrier?
    ----------------------------------
    SiteSpec has NO dependency on the ephemeris engine (no SPICE, no Horizons).
    It's just coordinates + a name. The compare module passes these coordinates
    to visibility.timeline(), which handles the Horizons calls internally.
    This keeps compare.py testable without any external services.
    """
    name: str
    lat_deg: float
    lon_deg: float
    height_m: float = 2.0


# ---------------------------------------------------------------------------
# Scoring weights — what matters to the mission?
# ---------------------------------------------------------------------------

DEFAULT_WEIGHTS: dict[str, float] = {
    "sunlit_pct":           0.25,
    "longest_dark_h":       0.20,
    "earth_pct":            0.15,
    "longest_comms_gap_h":  0.10,
    "max_sun_el":           0.10,
    "energy_vert_kwh_m2":   0.10,
    "terrain_hz_mean":      0.05,
    "terrain_hz_max":       0.05,
}

WEIGHT_PROFILES: dict[str, dict[str, float]] = {
    "solar_rover": {
        "sunlit_pct":           0.30,
        "longest_dark_h":       0.25,
        "earth_pct":            0.10,
        "longest_comms_gap_h":  0.05,
        "max_sun_el":           0.10,
        "energy_vert_kwh_m2":   0.15,
        "terrain_hz_mean":      0.025,
        "terrain_hz_max":       0.025,
    },
    "relay_station": {
        "sunlit_pct":           0.15,
        "longest_dark_h":       0.10,
        "earth_pct":            0.30,
        "longest_comms_gap_h":  0.25,
        "max_sun_el":           0.05,
        "energy_vert_kwh_m2":   0.05,
        "terrain_hz_mean":      0.05,
        "terrain_hz_max":       0.05,
    },
    "crewed_habitat": {
        "sunlit_pct":           0.20,
        "longest_dark_h":       0.20,
        "earth_pct":            0.20,
        "longest_comms_gap_h":  0.15,
        "max_sun_el":           0.05,
        "energy_vert_kwh_m2":   0.10,
        "terrain_hz_mean":      0.05,
        "terrain_hz_max":       0.05,
    },
}


# ---------------------------------------------------------------------------
# Criteria definitions
# ---------------------------------------------------------------------------

CRITERIA: dict[str, dict] = {
    "sunlit_pct":          {"higher_is_better": True,  "unit": "%",    "label": "Sunlit time"},
    "longest_dark_h":      {"higher_is_better": False, "unit": "h",    "label": "Longest night"},
    "earth_pct":           {"higher_is_better": True,  "unit": "%",    "label": "Earth visibility"},
    "longest_comms_gap_h": {"higher_is_better": False, "unit": "h",    "label": "Longest comms gap"},
    "max_sun_el":          {"higher_is_better": True,  "unit": "deg",  "label": "Max Sun elevation"},
    "energy_vert_kwh_m2":  {"higher_is_better": True,  "unit": "kWh/m2", "label": "Energy (vertical panel)"},
    "terrain_hz_mean":     {"higher_is_better": False, "unit": "deg",  "label": "Terrain horizon (mean)"},
    "terrain_hz_max":      {"higher_is_better": False, "unit": "deg",  "label": "Terrain horizon (max)"},
}


# ---------------------------------------------------------------------------
# Scoring functions
# ---------------------------------------------------------------------------

def normalise_weights(weights: dict[str, float]) -> dict[str, float]:
    """Normalise weights so they sum to 1.0.

    Without normalisation, weights summing to 5 or 50 would make the
    total score exceed 100. Normalising guarantees 0–100 range.
    """
    total = sum(weights.values())
    if total <= 0:
        raise ValueError("Weights must sum to a positive number.")
    return {k: v / total for k, v in weights.items()}


def score_criterion(values: list[float], higher_is_better: bool) -> list[float]:
    """Score a list of site values on one criterion, 0–100.

    Linear scaling between worst (score 0) and best (score 100).
    If all values are the same, every site scores 100.
    """
    best = max(values) if higher_is_better else min(values)
    worst = min(values) if higher_is_better else max(values)

    spread = abs(best - worst)
    if spread < 1e-12:
        return [100.0] * len(values)

    scores = []
    for v in values:
        if higher_is_better:
            s = 100.0 * (v - worst) / spread
        else:
            s = 100.0 * (worst - v) / spread
        scores.append(max(0.0, min(100.0, s)))

    return scores


# ---------------------------------------------------------------------------
# Site analysis — run visibility for one site (REWIRED for Horizons)
# ---------------------------------------------------------------------------

def analyse_site(
    spec: SiteSpec,
    start_utc: datetime,
    days: float,
    step_min: float,
    terrain_profile=None,
) -> dict:
    """Run the full visibility analysis for one site.

    Parameters
    ----------
    spec : SiteSpec
        Site location and name.
    start_utc : datetime
        Start of the analysis window (timezone-aware UTC).
    days : float
        Duration in days.
    step_min : float
        Time step in minutes.
    terrain_profile : HorizonProfile or None
        If provided, use real terrain horizon (from Phase 6).
        If None, use the smooth-sphere approximation.

    Returns
    -------
    dict
        All the values needed for scoring.

    What changed (Horizons rewire)
    ------------------------------
    BEFORE:
        from .topocentric import Site        ← SPICE dependency
        site = Site(spec.name, ...)          ← needed SPICE kernels
        tl = timeline(site, horizon_deg, start_utc, days, step_min)

    AFTER:
        from .visibility import timeline     ← uses Horizons internally
        tl = timeline(lat_deg, lon_deg, start, stop, ...)
        No Site object needed — visibility.timeline takes raw coordinates.

    The rewired visibility.timeline() accepts:
        lat_deg, lon_deg, start (str), stop (str), step_min, height_m,
        horizon_deg (optional override)
    instead of the old (Site, horizon_deg, start_utc, days, step_min).
    """
    # Import here to allow testing compare.py with mocked analyse_site
    from .visibility import timeline, summarise, smooth_horizon_dip_deg

    # Determine horizon elevation
    if terrain_profile is not None:
        horizon_deg = float(np.mean(terrain_profile.horizon_deg))
    else:
        horizon_deg = smooth_horizon_dip_deg(spec.height_m)

    # Convert start_utc + days to start/stop strings for Horizons
    # Horizons accepts "2027-06-01" format
    start_str = start_utc.strftime("%Y-%m-%d")
    stop_dt = start_utc + timedelta(days=days)
    stop_str = stop_dt.strftime("%Y-%m-%d")

    # Run the timeline computation (this calls Horizons internally)
    # Pass terrain_profile for azimuth-dependent directional horizons.
    tl = timeline(
        lat_deg=spec.lat_deg,
        lon_deg=spec.lon_deg,
        start=start_str,
        stop=stop_str,
        step_min=step_min,
        height_m=spec.height_m,
        horizon_deg=horizon_deg,
        terrain_profile=terrain_profile,
    )

    # Extract summary statistics
    summary = summarise(tl, step_min)

    # Add terrain metrics
    if terrain_profile is not None:
        terrain_hz_mean = float(np.mean(terrain_profile.horizon_deg))
        terrain_hz_max  = float(np.max(terrain_profile.horizon_deg))
    else:
        terrain_hz_mean = 0.0
        terrain_hz_max  = 0.0

    return {
        "name":           spec.name,
        "lat_deg":        spec.lat_deg,
        "lon_deg":        spec.lon_deg,
        "height_m":       spec.height_m,
        "horizon_used_deg": horizon_deg,
        # From visibility.summarise:
        "sunlit_pct":          summary["sunlit_pct"],
        "longest_dark_h":      summary["longest_dark_h"],
        "earth_pct":           summary["earth_pct"],
        "longest_comms_gap_h": summary["longest_comms_gap_h"],
        "max_sun_el":          summary["max_sun_el"],
        "energy_vert_kwh_m2":  summary["energy_vert_kwh_m2"],
        "energy_flat_kwh_m2":  summary["energy_flat_kwh_m2"],
        "longest_both_h":      summary["longest_both_h"],
        "both_pct":            summary["both_pct"],
        # Terrain metrics:
        "terrain_hz_mean":     terrain_hz_mean,
        "terrain_hz_max":      terrain_hz_max,
    }


# ---------------------------------------------------------------------------
# Main comparison function
# ---------------------------------------------------------------------------

def compare_sites(
    sites: list[SiteSpec],
    start_utc: str | datetime,
    days: float = 29.53,
    step_min: float = 30.0,
    weights: Optional[dict[str, float]] = None,
    terrain_profiles: Optional[dict[str, object]] = None,
) -> dict:
    """Compare multiple candidate landing sites and rank them.

    Parameters
    ----------
    sites : list of SiteSpec
        Candidate landing sites to compare.
    start_utc : str or datetime
        Start of the analysis window. Strings are parsed as ISO format.
    days : float
        Duration in days. 29.53 = one synodic month.
    step_min : float
        Time step in minutes.
    weights : dict or None
        Criterion weights. If None, uses DEFAULT_WEIGHTS.
    terrain_profiles : dict or None
        Mapping of site name → HorizonProfile (from Phase 6 terrain.py).

    Returns
    -------
    dict with:
        metadata : dict — analysis parameters
        sites    : list of dict — raw analysis results per site
        scores   : list of dict — per-criterion scores (0-100) per site
        ranking  : list of dict — sites sorted by total weighted score
    """
    if len(sites) == 0:
        raise ValueError("Need at least one site to compare.")

    if isinstance(start_utc, str):
        dt = datetime.fromisoformat(start_utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        start_utc = dt

    if weights is None:
        weights = DEFAULT_WEIGHTS.copy()
    norm_weights = normalise_weights(weights)

    if terrain_profiles is None:
        terrain_profiles = {}

    # --- Step 1: Analyse each site ---
    site_results = []
    for spec in sites:
        profile = terrain_profiles.get(spec.name)
        result = analyse_site(spec, start_utc, days, step_min, profile)
        site_results.append(result)

    # --- Step 2-3: Score each criterion ---
    active_criteria = {k: v for k, v in norm_weights.items() if k in CRITERIA}
    all_scores: list[dict[str, float]] = [{} for _ in sites]

    for crit_name, crit_info in CRITERIA.items():
        if crit_name not in active_criteria:
            continue
        values = [r[crit_name] for r in site_results]
        crit_scores = score_criterion(values, crit_info["higher_is_better"])
        for i, s in enumerate(crit_scores):
            all_scores[i][crit_name] = s

    # --- Step 4: Weighted totals ---
    for i in range(len(sites)):
        total = 0.0
        for crit_name, weight in active_criteria.items():
            total += weight * all_scores[i].get(crit_name, 0.0)
        all_scores[i]["total_score"] = total

    # --- Step 5: Build ranking ---
    ranking = []
    for i, spec in enumerate(sites):
        row = {
            "rank": 0,
            "name": spec.name,
            "lat_deg": spec.lat_deg,
            "lon_deg": spec.lon_deg,
            "total_score": all_scores[i]["total_score"],
        }
        for crit_name in active_criteria:
            row[f"score_{crit_name}"] = all_scores[i][crit_name]
        for crit_name in active_criteria:
            row[f"raw_{crit_name}"] = site_results[i][crit_name]
        ranking.append(row)

    ranking.sort(key=lambda r: r["total_score"], reverse=True)
    for idx, row in enumerate(ranking):
        row["rank"] = idx + 1

    return {
        "metadata": {
            "start_utc": start_utc.isoformat(),
            "days": days,
            "step_min": step_min,
            "weights": norm_weights,
            "n_sites": len(sites),
        },
        "sites": site_results,
        "scores": all_scores,
        "ranking": ranking,
    }


# ---------------------------------------------------------------------------
# Convenience: format results as a readable table
# ---------------------------------------------------------------------------

def format_table(result: dict) -> str:
    """Format comparison results as a human-readable text table."""
    ranking = result["ranking"]
    if not ranking:
        return "No sites to compare."

    criteria_keys = [
        k.replace("score_", "")
        for k in ranking[0]
        if k.startswith("score_")
    ]

    lines = []
    lines.append("=" * 90)
    lines.append("SITE COMPARISON RANKING")
    lines.append(f"Analysis: {result['metadata']['days']:.1f} days from "
                 f"{result['metadata']['start_utc']}")
    lines.append("=" * 90)

    header = f"{'Rank':>4s}  {'Site':20s}  {'Total':>6s}"
    for crit in criteria_keys:
        label = CRITERIA.get(crit, {}).get("label", crit)
        header += f"  {label[:12]:>12s}"
    lines.append(header)
    lines.append("-" * len(header))

    for row in ranking:
        line = f"{row['rank']:4d}  {row['name']:20s}  {row['total_score']:6.1f}"
        for crit in criteria_keys:
            score = row.get(f"score_{crit}", 0.0)
            line += f"  {score:12.1f}"
        lines.append(line)

    lines.append("")
    lines.append("RAW VALUES")
    lines.append("-" * 70)

    for row in ranking:
        lines.append(f"\n  {row['name']} (Rank #{row['rank']})")
        for crit in criteria_keys:
            raw = row.get(f"raw_{crit}", 0.0)
            unit = CRITERIA.get(crit, {}).get("unit", "")
            label = CRITERIA.get(crit, {}).get("label", crit)
            lines.append(f"    {label:30s}: {raw:10.2f} {unit}")

    lines.append("\n" + "=" * 90)
    return "\n".join(lines)
