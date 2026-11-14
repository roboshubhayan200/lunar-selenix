"""Offline unit tests — run WITHOUT network access or real Horizons calls.

Every test mocks the Horizons API responses so you can run the full
suite on an airplane, during the competition, or in CI.

Run:  python -m pytest test_offline.py -v
  or: python test_offline.py   (uses unittest runner)
"""

import math
import sys
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import numpy as np

# Add project root
sys.path.insert(0, os.path.dirname(__file__))


# ═══════════════════════════════════════════════════════════════════
# FAKE HORIZONS DATA — simulates what the API would return
# ═══════════════════════════════════════════════════════════════════

FAKE_SUN_ROWS = [
    {"utc_str": "2027-Jun-01 00:00", "az_deg": 180.0, "el_deg":  1.5,
     "ang_diam_arcsec": 1891.0, "distance_au": 1.014},
    {"utc_str": "2027-Jun-01 00:30", "az_deg": 180.5, "el_deg":  1.6,
     "ang_diam_arcsec": 1891.0, "distance_au": 1.014},
    {"utc_str": "2027-Jun-01 01:00", "az_deg": 181.0, "el_deg":  1.7,
     "ang_diam_arcsec": 1891.0, "distance_au": 1.014},
    {"utc_str": "2027-Jun-01 01:30", "az_deg": 181.5, "el_deg": -0.3,
     "ang_diam_arcsec": 1891.0, "distance_au": 1.014},
]

FAKE_EARTH_ROWS = [
    {"utc_str": "2027-Jun-01 00:00", "az_deg":  10.0, "el_deg":  5.0,
     "ang_diam_arcsec": 115.0, "distance_au": 0.00257},
    {"utc_str": "2027-Jun-01 00:30", "az_deg":  10.1, "el_deg":  5.1,
     "ang_diam_arcsec": 115.0, "distance_au": 0.00257},
    {"utc_str": "2027-Jun-01 01:00", "az_deg":  10.2, "el_deg":  5.2,
     "ang_diam_arcsec": 115.0, "distance_au": 0.00257},
    {"utc_str": "2027-Jun-01 01:30", "az_deg":  10.3, "el_deg": -1.0,
     "ang_diam_arcsec": 115.0, "distance_au": 0.00257},
]


# ═══════════════════════════════════════════════════════════════════
# Test: constants.py
# ═══════════════════════════════════════════════════════════════════

class TestConstants(unittest.TestCase):
    def test_values(self):
        from lunar_backend.constants import (
            MOON_RADIUS_KM, AU_KM, SOLAR_CONSTANT_W_M2,
            SUN_RADIUS_KM, EARTH_RADIUS_KM,
        )
        self.assertAlmostEqual(MOON_RADIUS_KM, 1737.4)
        self.assertAlmostEqual(AU_KM, 149_597_870.7)
        self.assertAlmostEqual(SOLAR_CONSTANT_W_M2, 1361.0)
        self.assertAlmostEqual(SUN_RADIUS_KM, 695_700.0)
        self.assertAlmostEqual(EARTH_RADIUS_KM, 6_378.1)


# ═══════════════════════════════════════════════════════════════════
# Test: horizon_client.py — parsing logic (no HTTP)
# ═══════════════════════════════════════════════════════════════════

class TestHorizonsClient(unittest.TestCase):

    def test_parse_rows(self):
        """parse_rows should extract data between $$SOE and $$EOE."""
        from lunar_backend.horizon_client import parse_rows

        # Live Horizons outputs TWO flag columns for lunar surface observers:
        # Date, <solar_flag>, <target_flag>, Azi, Elev, Ang-diam, delta, deldot
        fake_text = (
            "Header stuff\n"
            "$$SOE\n"
            " 2027-Jun-01 00:00, , , 180.000, 1.500, 1891.000, 1.01400000, 0.00\n"
            " 2027-Jun-01 00:30, , , 180.500, 1.600, 1891.000, 1.01400000, 0.00\n"
            "$$EOE\n"
            "Footer stuff\n"
        )

        rows = parse_rows(fake_text)
        self.assertEqual(len(rows), 2)
        self.assertAlmostEqual(rows[0]["az_deg"], 180.0, places=1)
        self.assertAlmostEqual(rows[0]["el_deg"], 1.5, places=1)
        self.assertAlmostEqual(rows[1]["az_deg"], 180.5, places=1)

    def test_rows_to_arrays(self):
        """rows_to_arrays should produce NumPy arrays."""
        from lunar_backend.horizon_client import rows_to_arrays

        arrays = rows_to_arrays(FAKE_SUN_ROWS)
        self.assertEqual(len(arrays["az_deg"]), 4)
        self.assertAlmostEqual(arrays["el_deg"][0], 1.5)
        # ang_diam should be converted from arcsec to deg
        self.assertAlmostEqual(arrays["ang_diam_deg"][0], 1891.0 / 3600.0, places=4)

    def test_parse_utc_strings(self):
        """parse_utc_strings should handle the Horizons date format."""
        from lunar_backend.horizon_client import parse_utc_strings

        strings = np.array(["2027-Jun-01 00:00", "2027-Jun-01 00:30"])
        dts = parse_utc_strings(strings)
        self.assertEqual(len(dts), 2)
        self.assertEqual(dts[0].month, 6)
        self.assertEqual(dts[0].day, 1)
        self.assertEqual(dts[1].minute, 30)

    def test_cache_key_deterministic(self):
        """Same params should produce the same cache key."""
        from lunar_backend.horizon_client import _cache_key

        p1 = {"COMMAND": "'10'", "CENTER": "coord@301"}
        p2 = {"COMMAND": "'10'", "CENTER": "coord@301"}
        self.assertEqual(_cache_key(p1), _cache_key(p2))

    def test_cache_key_differs(self):
        """Different params should produce different cache keys."""
        from lunar_backend.horizon_client import _cache_key

        p1 = {"COMMAND": "'10'", "CENTER": "coord@301"}
        p2 = {"COMMAND": "'399'", "CENTER": "coord@301"}
        self.assertNotEqual(_cache_key(p1), _cache_key(p2))


# ═══════════════════════════════════════════════════════════════════
# Test: ephemeris.py — with mocked Horizons calls
# ═══════════════════════════════════════════════════════════════════

class TestEphemeris(unittest.TestCase):

    @patch("lunar_backend.horizon_client.fetch_sun", return_value=FAKE_SUN_ROWS)
    @patch("lunar_backend.horizon_client.fetch_earth", return_value=FAKE_EARTH_ROWS)
    def test_get_timeline(self, mock_earth, mock_sun):
        from lunar_backend.ephemeris import get_timeline

        data = get_timeline(
            lat_deg=-89.9, lon_deg=0.0,
            start="2027-06-01", stop="2027-06-02",
            step_min=30,
        )

        # Check dict keys
        for key in ["t_utc", "sun_az", "sun_el", "sun_range_au",
                     "sun_range_km", "sun_radius_deg",
                     "earth_az", "earth_el", "earth_range_au", "earth_range_km"]:
            self.assertIn(key, data, f"Missing key: {key}")

        # Check shapes match
        n = len(data["t_utc"])
        self.assertEqual(n, 4)
        self.assertEqual(len(data["sun_az"]), n)
        self.assertEqual(len(data["earth_el"]), n)

        # Check Sun radius = angular diameter / 2
        expected_radius = (1891.0 / 3600.0) / 2.0
        self.assertAlmostEqual(data["sun_radius_deg"][0], expected_radius, places=5)

        # Check km conversion
        from lunar_backend.constants import AU_KM
        self.assertAlmostEqual(data["sun_range_km"][0], 1.014 * AU_KM, places=0)


# ═══════════════════════════════════════════════════════════════════
# Test: visibility.py — pure math functions + mocked timeline
# ═══════════════════════════════════════════════════════════════════

class TestVisibility(unittest.TestCase):

    def test_disk_fraction_fully_above(self):
        """Sun well above horizon → fraction ≈ 1.0."""
        from lunar_backend.visibility import disk_fraction

        f = disk_fraction(center_el_deg=10.0, horizon_deg=0.0, radius_deg=0.27)
        self.assertAlmostEqual(f, 1.0, places=3)

    def test_disk_fraction_fully_below(self):
        """Sun well below horizon → fraction ≈ 0.0."""
        from lunar_backend.visibility import disk_fraction

        f = disk_fraction(center_el_deg=-5.0, horizon_deg=0.0, radius_deg=0.27)
        self.assertAlmostEqual(f, 0.0, places=3)

    def test_disk_fraction_half(self):
        """Sun centre exactly on horizon → fraction ≈ 0.5."""
        from lunar_backend.visibility import disk_fraction

        f = disk_fraction(center_el_deg=0.0, horizon_deg=0.0, radius_deg=0.27)
        self.assertAlmostEqual(f, 0.5, places=2)

    def test_smooth_horizon_dip(self):
        """Horizon dip should be small and negative for a 2m observer."""
        from lunar_backend.visibility import smooth_horizon_dip_deg

        dip = smooth_horizon_dip_deg(2.0)
        self.assertLess(dip, 0)
        self.assertGreater(dip, -0.1)  # should be very small

    def test_longest_run(self):
        """longest_run should find the longest consecutive True streak."""
        from lunar_backend.visibility import longest_run

        flags = np.array([False, True, True, True, False, True, True])
        result = longest_run(flags, step_h=0.5)
        self.assertAlmostEqual(result, 1.5)  # 3 steps × 0.5 h

    def test_longest_run_all_false(self):
        from lunar_backend.visibility import longest_run

        flags = np.array([False, False, False])
        result = longest_run(flags, step_h=1.0)
        self.assertAlmostEqual(result, 0.0)

    def test_battery_wh(self):
        from lunar_backend.visibility import battery_wh

        # 100W load, 10h dark, 80% DoD → 100*10/0.8 = 1250 Wh
        result = battery_wh(100.0, 10.0, 0.8)
        self.assertAlmostEqual(result, 1250.0)

    @patch("lunar_backend.visibility.get_timeline")
    def test_timeline_integration(self, mock_get_timeline):
        """timeline() should produce summary stats from mocked ephemeris data."""
        from lunar_backend.visibility import timeline, summarise

        # Build fake ephemeris return matching what get_timeline returns
        # Last timestep: sun_el = -2.0 (well below horizon + radius ~0.26 deg)
        # so sun_frac == 0.0 and irradiance == 0.0 (Fix 1 regression guard).
        n = 4
        mock_get_timeline.return_value = {
            "t_utc": np.array([
                datetime(2027, 6, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2027, 6, 1, 0, 30, tzinfo=timezone.utc),
                datetime(2027, 6, 1, 1, 0, tzinfo=timezone.utc),
                datetime(2027, 6, 1, 1, 30, tzinfo=timezone.utc),
            ]),
            "sun_az": np.array([180.0, 180.5, 181.0, 181.5]),
            "sun_el": np.array([1.5, 1.6, 1.7, -2.0]),
            "sun_range_au": np.full(n, 1.014),
            "sun_range_km": np.full(n, 1.014 * 149_597_870.7),
            "sun_radius_deg": np.full(n, 1891.0 / 3600.0 / 2.0),
            "earth_az": np.array([10.0, 10.1, 10.2, 10.3]),
            "earth_el": np.array([5.0, 5.1, 5.2, -1.0]),
            "earth_range_au": np.full(n, 0.00257),
            "earth_range_km": np.full(n, 0.00257 * 149_597_870.7),
        }

        tl = timeline(
            lat_deg=-89.9, lon_deg=0.0,
            start="2027-06-01", stop="2027-06-02",
            step_min=30, height_m=2.0,
        )

        # Should have all expected keys
        for key in ["t_utc", "sun_az", "sun_el", "sun_frac",
                     "earth_az", "earth_el", "earth_vis", "irradiance"]:
            self.assertIn(key, tl, f"Missing key: {key}")

        # Sun is above horizon for first 3 timesteps
        self.assertTrue(tl["sun_frac"][0] > 0)

        # Irradiance should be 0 where sun_frac is 0 (Fix 1 regression guard)
        # The last timestep has sun_el = -0.3, well below horizon → sun_frac ≈ 0
        # so irradiance must also be ≈ 0 (not ~1360 from a subtraction bug).
        self.assertAlmostEqual(tl["irradiance"][-1], 0.0, places=1)

        # When Sun is well above horizon, irradiance should be > 1300 W/m²
        self.assertGreater(tl["irradiance"][0], 1300.0)

        # Summarise
        summary = summarise(tl, step_min=30)
        self.assertIn("sunlit_pct", summary)
        self.assertIn("longest_dark_h", summary)
        self.assertGreater(summary["sunlit_pct"], 0)


# ═══════════════════════════════════════════════════════════════════
# Test: api.py — Flask test-client (no Horizons network calls)
# ═══════════════════════════════════════════════════════════════════

class TestFlaskAPI(unittest.TestCase):

    def setUp(self):
        from lunar_backend.scoring.api import create_app
        self.app = create_app()
        self.client = self.app.test_client()

    def test_health(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "ok")

    def test_site_presets(self):
        resp = self.client.get("/api/site-presets")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("sites", data)
        self.assertGreater(len(data["sites"]), 0)
        # Check equatorial reference site is present
        names = [s["name"] for s in data["sites"]]
        self.assertTrue(
            any("Equatorial" in n for n in names),
            "Equatorial reference site should be in presets",
        )

    def test_compare_missing_sites(self):
        resp = self.client.post(
            "/api/compare",
            json={},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_compare_step_min_float_rejected(self):
        resp = self.client.post(
            "/api/compare",
            json={
                "sites": [{"name": "A", "lat_deg": -89.9, "lon_deg": 0.0}],
                "step_min": 30.5,
            },
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("integer", resp.get_json()["error"])

    @patch("lunar_backend.visibility.get_timeline")
    def test_timeline_endpoint(self, mock_get_tl):
        """POST /api/timeline should return summary + series."""
        n = 4
        mock_get_tl.return_value = {
            "t_utc": np.array([
                datetime(2027, 6, 1, 0, 0, tzinfo=timezone.utc),
                datetime(2027, 6, 1, 0, 30, tzinfo=timezone.utc),
                datetime(2027, 6, 1, 1, 0, tzinfo=timezone.utc),
                datetime(2027, 6, 1, 1, 30, tzinfo=timezone.utc),
            ]),
            "sun_az": np.array([180.0, 180.5, 181.0, 181.5]),
            "sun_el": np.array([1.5, 1.6, 1.7, -0.3]),
            "sun_range_au": np.full(n, 1.014),
            "sun_range_km": np.full(n, 1.014 * 149_597_870.7),
            "sun_radius_deg": np.full(n, 1891.0 / 3600.0 / 2.0),
            "earth_az": np.array([10.0, 10.1, 10.2, 10.3]),
            "earth_el": np.array([5.0, 5.1, 5.2, -1.0]),
            "earth_range_au": np.full(n, 0.00257),
            "earth_range_km": np.full(n, 0.00257 * 149_597_870.7),
        }

        # The route does a bare `from visibility import ...`; alias it to the
        # package module so the import resolves and the patch above applies.
        import lunar_backend.visibility as vis_mod
        with patch.dict(sys.modules, {"visibility": vis_mod}):
            resp = self.client.post(
                "/api/timeline",
                json={"lat_deg": -89.9, "lon_deg": 0.0, "days": 2, "step_min": 30},
                content_type="application/json",
            )
        self.assertEqual(resp.status_code, 200, resp.get_json())
        data = resp.get_json()
        self.assertIn("summary", data)
        self.assertIn("series", data)
        self.assertIn("physics_notes", data)
        self.assertIn("t_utc", data["series"])
        self.assertIn("battery_required_wh", data["summary"])

    def test_timeline_missing_coords(self):
        resp = self.client.post(
            "/api/timeline",
            json={"days": 2},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)


# ═══════════════════════════════════════════════════════════════════
# Test: compare.py — scoring and comparison with mocked analysis
# ═══════════════════════════════════════════════════════════════════

class TestCompare(unittest.TestCase):

    def test_normalise_weights(self):
        from lunar_backend.compare import normalise_weights

        w = {"a": 2.0, "b": 3.0}
        nw = normalise_weights(w)
        self.assertAlmostEqual(nw["a"], 0.4)
        self.assertAlmostEqual(nw["b"], 0.6)

    def test_score_criterion_higher_is_better(self):
        from lunar_backend.compare import score_criterion

        values = [10.0, 50.0, 90.0]
        scores = score_criterion(values, higher_is_better=True)
        self.assertAlmostEqual(scores[0], 0.0)    # worst
        self.assertAlmostEqual(scores[1], 50.0)   # middle
        self.assertAlmostEqual(scores[2], 100.0)  # best

    def test_score_criterion_lower_is_better(self):
        from lunar_backend.compare import score_criterion

        values = [10.0, 50.0, 90.0]
        scores = score_criterion(values, higher_is_better=False)
        self.assertAlmostEqual(scores[0], 100.0)  # best (lowest)
        self.assertAlmostEqual(scores[2], 0.0)    # worst (highest)

    def test_score_criterion_all_equal(self):
        from lunar_backend.compare import score_criterion

        values = [42.0, 42.0, 42.0]
        scores = score_criterion(values, higher_is_better=True)
        self.assertTrue(all(s == 100.0 for s in scores))

    def test_site_spec_frozen(self):
        # pyrefly: ignore[missing-import]
        from lunar_backend.compare import SiteSpec

        s = SiteSpec("Test", -89.0, 0.0, 2.0)
        with self.assertRaises(AttributeError):
            s.name = "Changed"

    def test_weight_profiles_exist(self):
        # pyrefly: ignore[missing-import]
        from lunar_backend.compare import WEIGHT_PROFILES

        self.assertIn("solar_rover", WEIGHT_PROFILES)
        self.assertIn("relay_station", WEIGHT_PROFILES)
        self.assertIn("crewed_habitat", WEIGHT_PROFILES)

    @patch("lunar_backend.compare.analyse_site")
    def test_compare_sites(self, mock_analyse):
        """compare_sites should rank sites by weighted score."""
        from lunar_backend.compare import compare_sites, SiteSpec

        # Site A: great sunlit, bad comms gap
        # Site B: average everything
        mock_analyse.side_effect = [
            {
                "name": "Site A", "lat_deg": -89.0, "lon_deg": 0.0,
                "height_m": 2.0, "horizon_used_deg": -0.05,
                "sunlit_pct": 90.0, "longest_dark_h": 50.0,
                "earth_pct": 60.0, "longest_comms_gap_h": 100.0,
                "max_sun_el": 3.0, "energy_vert_kwh_m2": 50.0,
                "energy_flat_kwh_m2": 40.0, "longest_both_h": 10.0,
                "both_pct": 55.0, "terrain_hz_mean": 1.0, "terrain_hz_max": 5.0,
            },
            {
                "name": "Site B", "lat_deg": -88.0, "lon_deg": -86.0,
                "height_m": 2.0, "horizon_used_deg": -0.05,
                "sunlit_pct": 70.0, "longest_dark_h": 80.0,
                "earth_pct": 80.0, "longest_comms_gap_h": 50.0,
                "max_sun_el": 2.0, "energy_vert_kwh_m2": 40.0,
                "energy_flat_kwh_m2": 30.0, "longest_both_h": 15.0,
                "both_pct": 65.0, "terrain_hz_mean": 2.0, "terrain_hz_max": 8.0,
            },
        ]

        sites = [
            SiteSpec("Site A", -89.0, 0.0),
            SiteSpec("Site B", -88.0, -86.0),
        ]

        result = compare_sites(sites, start_utc="2027-06-01", days=29.53)

        self.assertIn("ranking", result)
        self.assertIn("metadata", result)
        self.assertEqual(len(result["ranking"]), 2)
        self.assertEqual(result["ranking"][0]["rank"], 1)
        self.assertEqual(result["ranking"][1]["rank"], 2)

        # Total scores should be 0–100
        for row in result["ranking"]:
            self.assertGreaterEqual(row["total_score"], 0)
            self.assertLessEqual(row["total_score"], 100)


if __name__ == "__main__":
    unittest.main()
