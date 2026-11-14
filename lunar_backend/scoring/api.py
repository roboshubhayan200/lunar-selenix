"""REST API — serve the backend over HTTP so a frontend can call it.

This module turns the Python backend into a web service. A React or
Vue.js frontend sends HTTP requests; this API returns JSON.

Why Flask?
----------
Flask is the simplest Python web framework. It's perfect for a hackathon:
  - Minimal boilerplate (you can have an API running in 10 lines)
  - Huge community and documentation
  - The NASA Space Apps judges know it well
  - Easy to deploy (Heroku, Render, Railway, Docker — all support it)

FastAPI is a popular alternative (automatic docs, type validation), but
Flask is simpler for a hackathon project. We keep the option to swap by
keeping all business logic in compare.py — the API layer is just routing.

API Endpoints
-------------
GET  /api/health          → {"status": "ok"} — is the server alive?
POST /api/compare         → run comparison, return ranking JSON
GET  /api/criteria        → list available scoring criteria
GET  /api/weight-profiles → list pre-defined weight profiles
GET  /api/site-presets    → well-known candidate sites

CORS
----
We enable Cross-Origin Resource Sharing (CORS) so the frontend
(which runs on a different port during development, e.g. localhost:3000)
can call this API (which runs on localhost:5000).

Usage
-----
    # Development server:
    python -m lunarnav_backend.api

    # Or import the app for gunicorn/waitress:
    from lunarnav_backend.api import create_app
    app = create_app()
"""

from __future__ import annotations

import json
import traceback
from datetime import datetime, timezone
from typing import Optional

# pyrefly: ignore[missing-import]
from flask import Flask, jsonify, request


# ---------------------------------------------------------------------------
# Well-known candidate landing sites
# ---------------------------------------------------------------------------
# These are real Artemis candidate sites that NASA has studied.
# Source: NASA Human Landing System reports, LROC site studies.
# Having these as presets lets the frontend offer a dropdown of sites
# instead of making users type coordinates.

SITE_PRESETS = [
    {
        "name": "Shackleton Rim",
        "lat_deg": -89.9,
        "lon_deg": 0.0,
        "height_m": 2.0,
        "description": "Rim of Shackleton crater at the south pole. "
                       "Near-permanent sunlight, deep crater for ice access.",
    },
    {
        "name": "de Gerlache Rim",
        "lat_deg": -88.5,
        "lon_deg": -86.5,
        "height_m": 2.0,
        "description": "Rim of de Gerlache crater. Good Earth visibility, "
                       "moderate sunlight.",
    },
    {
        "name": "Connecting Ridge",
        "lat_deg": -89.4,
        "lon_deg": 222.0,
        "height_m": 2.0,
        "description": "Ridge connecting Shackleton and de Gerlache craters. "
                       "Potential for extended sunlight.",
    },
    {
        "name": "Malapert Massif",
        "lat_deg": -86.0,
        "lon_deg": 0.0,
        "height_m": 2.0,
        "description": "High plateau with excellent Earth visibility. "
                       "Proposed relay station site.",
    },
    {
        "name": "Leibnitz Beta Plateau",
        "lat_deg": -85.3,
        "lon_deg": 31.0,
        "height_m": 2.0,
        "description": "Elevated plateau south of Leibnitz crater. "
                       "Large flat area for landing.",
    },
    {
        "name": "Nobile Rim (Site 001)",
        "lat_deg": -85.3,
        "lon_deg": 32.8,
        "height_m": 2.0,
        "description": "Rim of Nobile crater, one of NASA's Artemis III "
                       "candidate regions.",
    },
    {
        "name": "Haworth Rim",
        "lat_deg": -87.5,
        "lon_deg": -22.0,
        "height_m": 2.0,
        "description": "Rim of Haworth crater, permanently shadowed interior "
                       "may contain water ice.",
    },
    {
        "name": "Faustini Rim",
        "lat_deg": -87.2,
        "lon_deg": 84.0,
        "height_m": 2.0,
        "description": "Rim of Faustini crater, near the south pole, "
                       "with access to permanently shadowed regions.",
    },
    {
        "name": "Mare Tranquillitatis (Equatorial Reference)",
        "lat_deg": 0.67,
        "lon_deg": 23.47,
        "height_m": 2.0,
        "description": "Apollo 11 landing site on the equatorial nearside. "
                       "Useful as a baseline for polar-vs-equatorial comparisons "
                       "in Educator Mode.",
    },
]


# ---------------------------------------------------------------------------
# App factory — the Flask way to create an app
# ---------------------------------------------------------------------------

def create_app() -> Flask:
    """Create and configure the Flask application.

    Why a factory function?
    -----------------------
    Flask's "application factory" pattern is best practice:
      1. You can create multiple app instances (useful for testing).
      2. Configuration can be passed in.
      3. Circular imports are avoided (no module-level app object).

    Returns
    -------
    Flask
        A configured Flask application with all routes registered.
    """
    app = Flask(__name__)

    # Enable CORS for all routes
    # In production you'd restrict this to your frontend's domain.
    @app.after_request
    def add_cors_headers(response):
        """Add CORS headers to every response.

        What is CORS?
        -------------
        When your React frontend (running on localhost:3000) makes a
        request to your Flask API (running on localhost:5000), the browser
        blocks it by default — it's a "cross-origin" request (different
        port = different origin).

        CORS headers tell the browser "it's OK, I accept requests from
        other origins." Without these headers, your frontend can't talk
        to your backend.

        The three headers:
        - Access-Control-Allow-Origin: * → accept from any origin
        - Access-Control-Allow-Headers: Content-Type → accept JSON bodies
        - Access-Control-Allow-Methods: GET, POST, OPTIONS → accept these methods
        """
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

    # -------------------------------------------------------------------
    # Routes
    # -------------------------------------------------------------------

    @app.route("/api/health", methods=["GET"])
    def health():
        """Health check — is the server running?

        Every production API needs a health endpoint. Load balancers and
        monitoring systems ping it to check if the service is alive.
        Kubernetes uses it for readiness probes.

        Returns
        -------
        JSON: {"status": "ok"}
        HTTP 200
        """
        return jsonify({"status": "ok"})

    @app.route("/api/criteria", methods=["GET"])
    def criteria():
        """List available scoring criteria.

        The frontend uses this to populate a UI where users can
        adjust scoring weights. Each criterion has:
          - key: the internal name (used in weights dict)
          - label: human-readable name for display
          - unit: the measurement unit
          - higher_is_better: direction of preference

        Returns
        -------
        JSON: {"criteria": [...]}
        HTTP 200
        """
        from lunar_backend.compare import CRITERIA
        result = []
        for key, info in CRITERIA.items():
            result.append({
                "key": key,
                "label": info["label"],
                "unit": info["unit"],
                "higher_is_better": info["higher_is_better"],
            })
        return jsonify({"criteria": result})

    @app.route("/api/weight-profiles", methods=["GET"])
    def weight_profiles():
        """List pre-defined weight profiles.

        The frontend can offer these as presets: "Optimise for solar rover",
        "Optimise for relay station", etc.

        Returns
        -------
        JSON: {"profiles": {"solar_rover": {...}, ...}, "default": {...}}
        HTTP 200
        """
        from lunar_backend.compare import WEIGHT_PROFILES, DEFAULT_WEIGHTS
        return jsonify({
            "profiles": WEIGHT_PROFILES,
            "default": DEFAULT_WEIGHTS,
        })

    @app.route("/api/site-presets", methods=["GET"])
    def site_presets():
        """List well-known candidate landing sites.

        The frontend can use these as a dropdown or quick-select buttons.

        Returns
        -------
        JSON: {"sites": [...]}
        HTTP 200
        """
        return jsonify({"sites": SITE_PRESETS})

    @app.route("/api/compare", methods=["POST", "OPTIONS"])
    def compare():
        """Compare candidate sites and return the ranking.

        This is the main endpoint — the frontend sends a list of sites
        and gets back a full comparison with scores and ranking.

        Request body (JSON)
        -------------------
        {
            "sites": [
                {"name": "Site A", "lat_deg": -89.9, "lon_deg": 0.0},
                {"name": "Site B", "lat_deg": -88.5, "lon_deg": -86.5}
            ],
            "start_utc": "2027-06-01",      // optional, default: "2027-06-01"
            "days": 29.53,                   // optional, default: 29.53
            "step_min": 30.0,                // optional, default: 30.0
            "weights": {"sunlit_pct": 0.3},  // optional, default: DEFAULT_WEIGHTS
            "weight_profile": "solar_rover"  // optional, overrides weights
        }

        Response (JSON)
        ---------------
        {
            "metadata": { ... },
            "sites": [ ... ],
            "scores": [ ... ],
            "ranking": [ ... ]
        }

        Error response (JSON)
        ---------------------
        {
            "error": "description of what went wrong"
        }

        How it works
        ------------
        1. Parse the JSON body.
        2. Validate: at least 1 site, valid coordinates, etc.
        3. Build SiteSpec objects.
        4. Resolve weights (custom, profile, or default).
        5. Call compare_sites().
        6. Return the result as JSON.

        OPTIONS method
        --------------
        Browsers send a "preflight" OPTIONS request before a POST with
        a JSON body. We return 200 with CORS headers (handled by
        add_cors_headers above).
        """
        # Handle CORS preflight
        if request.method == "OPTIONS":
            return jsonify({}), 200

        # --- Parse request body ---
        body = request.get_json(silent=True)
        if body is None:
            return jsonify({"error": "Request body must be valid JSON."}), 400

        # --- Validate sites ---
        sites_raw = body.get("sites")
        if not sites_raw or not isinstance(sites_raw, list):
            return jsonify({
                "error": "Request must include 'sites': a list of at least "
                         "one site with 'name', 'lat_deg', 'lon_deg'."
            }), 400

        if len(sites_raw) > 20:
            return jsonify({
                "error": "Maximum 20 sites per comparison (each site runs "
                         "a full ephemeris computation)."
            }), 400

        from lunar_backend.compare import SiteSpec, compare_sites, WEIGHT_PROFILES

        site_specs = []
        for i, s in enumerate(sites_raw):
            if not isinstance(s, dict):
                return jsonify({
                    "error": f"Site {i} must be a JSON object."
                }), 400

            name = s.get("name", f"Site_{i+1}")
            lat = s.get("lat_deg")
            lon = s.get("lon_deg")
            height = s.get("height_m", 2.0)

            if lat is None or lon is None:
                return jsonify({
                    "error": f"Site '{name}' is missing 'lat_deg' or 'lon_deg'."
                }), 400

            try:
                lat = float(lat)
                lon = float(lon)
                height = float(height)
            except (ValueError, TypeError):
                return jsonify({
                    "error": f"Site '{name}': lat_deg, lon_deg, height_m "
                             "must be numbers."
                }), 400

            if not (-90.0 <= lat <= 90.0):
                return jsonify({
                    "error": f"Site '{name}': lat_deg must be between "
                             "-90 and 90."
                }), 400

            if not (-360.0 <= lon <= 360.0):
                return jsonify({
                    "error": f"Site '{name}': lon_deg must be between "
                             "-360 and 360."
                }), 400

            site_specs.append(SiteSpec(name, lat, lon, height))

        # --- Resolve parameters ---
        start_utc = body.get("start_utc", "2027-06-01")
        days = body.get("days", 29.53)
        step_min = body.get("step_min", 30)

        try:
            days = float(days)
        except (ValueError, TypeError):
            return jsonify({
                "error": "'days' must be a number."
            }), 400

        # step_min must be a strict integer (no sub-minute floats)
        try:
            step_min_f = float(step_min)
            if step_min_f != int(step_min_f):
                return jsonify({
                    "error": "'step_min' must be an integer (no fractional minutes)."
                }), 400
            step_min = int(step_min_f)
        except (ValueError, TypeError):
            return jsonify({
                "error": "'step_min' must be an integer."
            }), 400

        if days <= 0 or days > 365.25:
            return jsonify({
                "error": "'days' must be between 0 and 365.25."
            }), 400

        if step_min < 1 or step_min > 1440:
            return jsonify({
                "error": "'step_min' must be between 1 and 1440."
            }), 400

        # --- Resolve weights ---
        weights = None

        # Check for a named profile first
        profile_name = body.get("weight_profile")
        if profile_name:
            if profile_name in WEIGHT_PROFILES:
                weights = WEIGHT_PROFILES[profile_name].copy()
            else:
                return jsonify({
                    "error": f"Unknown weight profile '{profile_name}'. "
                             f"Available: {list(WEIGHT_PROFILES.keys())}"
                }), 400

        # Custom weights override the profile
        custom_weights = body.get("weights")
        if custom_weights and isinstance(custom_weights, dict):
            if weights is None:
                weights = {}
            weights.update(custom_weights)

        # --- Run the comparison ---
        try:
            result = compare_sites(
                site_specs,
                start_utc=start_utc,
                days=days,
                step_min=step_min,
                weights=weights,
            )
        except Exception as e:
            # Return the error message (in development; in production you'd
            # log the full traceback and return a generic message).
            return jsonify({
                "error": f"Comparison failed: {str(e)}",
                "traceback": traceback.format_exc(),
            }), 500

        return jsonify(result)

    # -------------------------------------------------------------------
    # POST /api/timeline — raw time-series for a single site
    # -------------------------------------------------------------------

    @app.route("/api/timeline", methods=["POST", "OPTIONS"])
    def timeline_endpoint():
        """Return full time-series telemetry for a single site.

        This endpoint powers frontend charts: Sun/Earth elevation curves,
        irradiance over time, and battery simulations.

        Request body (JSON)
        -------------------
        {
            "lat_deg": -89.9,
            "lon_deg": 0.0,
            "height_m": 2.0,         // optional, default 2.0
            "start_utc": "2027-06-01", // optional, default "2027-06-01"
            "days": 29.53,            // optional, default 29.53
            "step_min": 30,           // optional, default 30 (integer)
            "load_w": 100.0           // optional, default 100.0
        }

        Response (JSON)
        ---------------
        {
            "summary": { ... },
            "series": {
                "t_utc": [...], "sun_az": [...], "sun_el": [...],
                "sun_frac": [...], "earth_az": [...], "earth_el": [...],
                "earth_vis": [...], "irradiance": [...]
            },
            "physics_notes": "..."
        }
        """
        if request.method == "OPTIONS":
            return jsonify({}), 200

        body = request.get_json(silent=True)
        if body is None:
            return jsonify({"error": "Request body must be valid JSON."}), 400

        lat = body.get("lat_deg")
        lon = body.get("lon_deg")
        if lat is None or lon is None:
            return jsonify({
                "error": "'lat_deg' and 'lon_deg' are required."
            }), 400

        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            return jsonify({
                "error": "'lat_deg' and 'lon_deg' must be numbers."
            }), 400

        if not (-90.0 <= lat <= 90.0):
            return jsonify({"error": "lat_deg must be between -90 and 90."}), 400
        if not (-360.0 <= lon <= 360.0):
            return jsonify({"error": "lon_deg must be between -360 and 360."}), 400

        height_m = body.get("height_m", 2.0)
        start_utc = body.get("start_utc", "2027-06-01")
        days = body.get("days", 29.53)
        step_min = body.get("step_min", 30)
        load_w = body.get("load_w", 100.0)

        try:
            height_m = float(height_m)
            days = float(days)
            load_w = float(load_w)
        except (ValueError, TypeError):
            return jsonify({
                "error": "'height_m', 'days', 'load_w' must be numbers."
            }), 400

        # Enforce integer step_min
        try:
            step_min_f = float(step_min)
            if step_min_f != int(step_min_f):
                return jsonify({
                    "error": "'step_min' must be an integer."
                }), 400
            step_min = int(step_min_f)
        except (ValueError, TypeError):
            return jsonify({"error": "'step_min' must be an integer."}), 400

        if step_min < 1 or step_min > 1440:
            return jsonify({
                "error": "'step_min' must be between 1 and 1440."
            }), 400

        if days <= 0 or days > 365.25:
            return jsonify({"error": "'days' must be between 0 and 365.25."}), 400

        # Compute stop date
        from datetime import timedelta
        dt_start = datetime.fromisoformat(start_utc)
        if dt_start.tzinfo is None:
            dt_start = dt_start.replace(tzinfo=timezone.utc)
        dt_stop = dt_start + timedelta(days=days)
        stop_str = dt_stop.strftime("%Y-%m-%d")

        try:
            from lunar_backend.visibility import timeline as vis_timeline, summarise, battery_wh

            tl = vis_timeline(
                lat_deg=lat,
                lon_deg=lon,
                start=start_utc,
                stop=stop_str,
                step_min=step_min,
                height_m=height_m,
            )

            summary = summarise(tl, step_min)

            # Battery sizing
            battery = battery_wh(load_w, summary["longest_dark_h"])
            summary["battery_required_wh"] = battery

            # Convert NumPy arrays to JSON-safe lists
            series = {
                "t_utc":      [t.isoformat() for t in tl["t_utc"]],
                "sun_az":     tl["sun_az"].tolist(),
                "sun_el":     tl["sun_el"].tolist(),
                "sun_frac":   tl["sun_frac"].tolist(),
                "earth_az":   tl["earth_az"].tolist(),
                "earth_el":   tl["earth_el"].tolist(),
                "earth_vis":  tl["earth_vis"].tolist(),
                "irradiance": tl["irradiance"].tolist(),
            }

            # Educator Mode physics notes
            vert_kwh = summary.get("energy_vert_kwh_m2", 0)
            flat_kwh = summary.get("energy_flat_kwh_m2", 0)
            physics_notes = (
                f"Over {days:.1f} days, a vertical panel receives "
                f"{vert_kwh:.1f} kWh/m² while a horizontal panel receives "
                f"{flat_kwh:.1f} kWh/m². At polar latitudes the Sun barely "
                f"rises above the horizon, so vertical panels dramatically "
                f"outperform flat ones. The grazing twilight — when the Sun "
                f"is partially obscured by terrain — can last hours, unlike "
                f"the brief twilight at equatorial sites."
            )

        except Exception as e:
            return jsonify({
                "error": f"Timeline computation failed: {str(e)}",
                "traceback": traceback.format_exc(),
            }), 500

        return jsonify({
            "summary": summary,
            "series": series,
            "physics_notes": physics_notes,
        })

    return app


# ---------------------------------------------------------------------------
# Run the development server
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = create_app()
    print("=" * 60)
    print("Lunar Landing Site Navigator — API Server")
    print("=" * 60)
    print("Endpoints:")
    print("  GET  /api/health          → health check")
    print("  GET  /api/criteria        → scoring criteria")
    print("  GET  /api/weight-profiles → weight presets")
    print("  GET  /api/site-presets    → candidate site list")
    print("  POST /api/compare         → run comparison")
    print("  POST /api/timeline        → single-site time-series")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
