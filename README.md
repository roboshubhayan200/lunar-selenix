<p align="center">
  <img src="https://img.shields.io/badge/NASA-Space%20Apps%202026-blue?style=for-the-badge&logo=nasa" alt="NASA Space Apps 2026"/>
  <img src="https://img.shields.io/badge/Challenge-Lunar%20Site%20Navigator-orange?style=for-the-badge" alt="Challenge"/>
  <img src="https://img.shields.io/badge/Status-Live-brightgreen?style=for-the-badge" alt="Status"/>
</p>

# 🌙 Lunar Selenix — Lunar Landing Site Navigator

**A real-time lunar landing site analysis platform powered by NASA's JPL Horizons ephemeris engine.**

Lunar Selenix helps mission planners, educators, and students evaluate any point on the Moon's surface as a candidate landing or base site — using real orbital mechanics, not approximations.

> 🏆 Built for the **NASA International Space Apps Challenge 2026**  
> 📋 Challenge: *Lunar Site Navigator*

---

## 🔗 Live Demo

| Component | URL |
|-----------|-----|
| **Frontend** | *[https://lunar-selenix.vercel.app/]* |
| **Backend API** | *[https://lunar-selenix.onrender.com/]* |

---

## 📌 What It Does

Given any selenographic coordinate and time window, Lunar Selenix computes:

- ☀️ **Solar illumination** — Sun elevation, azimuth, and fractional visibility over time
- 🌍 **Earth visibility** — Earth elevation and Direct-to-Earth (DTE) communication windows
- ⚡ **Solar irradiance** — Energy on flat and tilted panels (inverse-square law + cosine correction)
- 🔋 **Battery sizing** — Required Wh to survive the longest darkness period
- 📊 **Site comparison** — Rank up to 10 sites with customizable weighted scoring
- 🗺️ **Status classification** — Every timestep tagged: power+comms, power-only, comms-only, or blackout

All data comes directly from **NASA's JPL Horizons API** — real ephemeris, real physics.

---

## 🖥️ Dual-Mode Interface

### Explorer Mode (Dark Theme)
Designed for **educators, students, and the public**:
- Interactive 3D Moon globe (React Three Fiber + NASA LROC texture)
- Click any point to select coordinates
- Animated surface viewport: lander with solar power rays and Earth DTE links
- Color-coded status strip (gold / yellow / blue / dark gray)
- Educational physics notes explaining polar vs equatorial illumination
- Timeline charts (Sun elevation, Earth elevation, irradiance)

### Planner Mode (Light Theme)
Designed for **mission planners and engineers**:
- Data-dense layout with summary statistics tables
- Side-by-side configuration comparison
- Overlaid timeline charts for direct comparison
- CSV/JSON export for downstream analysis
- No animations — pure data focus

---

## 🏗️ Architecture

```
┌─────────────────────┐         ┌──────────────────────────┐
│   React Frontend    │  HTTP   │     Flask Backend         │
│   (Vercel)          │◄───────►│     (Render)              │
│                     │  JSON   │                            │
│  - 3D Moon Globe    │         │  ┌──────────────────────┐ │
│  - Explorer Mode    │         │  │  JPL Horizons API    │ │
│  - Planner Mode     │         │  │  (NASA/JPL)          │ │
│  - Compare View     │         │  └──────────┬───────────┘ │
│  - Timeline Charts  │         │             ▼              │
│  - Status Strip     │         │  ┌──────────────────────┐ │
└─────────────────────┘         │  │  Visibility Engine   │ │
                                │  │  - Sun/Earth geometry │ │
                                │  │  - Irradiance model   │ │
                                │  │  - Battery sizing     │ │
                                │  └──────────┬───────────┘ │
                                │             ▼              │
                                │  ┌──────────────────────┐ │
                                │  │  Scoring & Ranking   │ │
                                │  │  - Weighted criteria  │ │
                                │  │  - Multi-site compare │ │
                                │  └──────────────────────┘ │
                                └──────────────────────────┘
```

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, Three.js / React Three Fiber, Recharts, Tailwind CSS, Framer Motion, Axios |
| **Backend** | Python 3.11, Flask, NumPy, Requests, Gunicorn |
| **Data Source** | NASA JPL Horizons System API |
| **Deployment** | Vercel (frontend), Render (backend) |
| **Version Control** | Git / GitHub |

---

## 🚀 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/site-presets` | 9 Artemis-era candidate landing sites |
| `GET` | `/api/criteria` | Available scoring criteria |
| `GET` | `/api/weight-profiles` | Pre-defined weight profiles (solar rover, relay station, etc.) |
| `POST` | `/api/compare` | Compare and rank multiple sites |
| `POST` | `/api/timeline` | Full time-series telemetry for a single site |

### Example: Timeline Request
```json
POST /api/timeline
{
  "lat_deg": -89.9,
  "lon_deg": 0.0,
  "height_m": 2.0,
  "start_utc": "2026-11-15",
  "days": 29.53,
  "step_min": 60
}
```

---

## 📍 Built-In Site Presets

| Site | Latitude | Longitude | Significance |
|------|----------|-----------|-------------|
| Shackleton Rim | -89.90° | 0.00° | Near-permanent sunlight, ice access |
| de Gerlache Rim | -88.50° | -86.50° | Good Earth visibility |
| Connecting Ridge | -89.40° | 222.00° | Extended sunlight potential |
| Malapert Massif | -86.00° | 0.00° | Excellent Earth visibility, relay station candidate |
| Leibnitz Beta Plateau | -85.30° | 31.00° | Large flat landing area |
| Nobile Rim (Site 001) | -85.30° | 32.80° | Artemis III candidate region |
| Haworth Rim | -87.50° | -22.00° | Permanently shadowed interior (water ice) |
| Faustini Rim | -87.20° | 84.00° | Near south pole, PSR access |
| Mare Tranquillitatis | 0.67° | 23.47° | Apollo 11 site — equatorial baseline |

---

## 🏃 Run Locally

### Backend
```bash
cd lunar_backend
pip install -r requirements.txt
python -m lunar_backend.scoring.api
# Server starts at http://localhost:5000
```

### Frontend
```bash
cd lunar_frontend/lunar-frontend
npm install
npm run dev
# App starts at http://localhost:5173
```

---

## 📊 Scoring Criteria

The comparison engine evaluates sites across these dimensions:

| Criterion | Unit | Higher is Better? |
|-----------|------|-------------------|
| Sunlit percentage | % | ✅ Yes |
| Max continuous sunlight | hours | ✅ Yes |
| Longest blackout | hours | ❌ No |
| Earth visibility | % | ✅ Yes |
| Max comms blackout | hours | ❌ No |
| Vertical panel energy | kWh/m² | ✅ Yes |
| Battery required | Wh | ❌ No |

Users can apply pre-built weight profiles (Solar Rover, Relay Station, Crewed Base) or define custom weights.

---

## 🧪 Testing

```bash
cd lunar_backend
python -m pytest test_offline.py -v
# 28 tests — all passing
```

Tests cover: Horizons API parsing, visibility computations, scoring logic, all API endpoints, edge cases (equatorial vs polar sites, date validation, coordinate bounds).

---

## 📚 Data Sources & References

| Resource | Usage |
|----------|-------|
| [JPL Horizons System](https://ssd.jpl.nasa.gov/horizons/) | Real-time ephemeris — Sun and Earth positions from lunar surface |
| [LROC QuickMap](https://quickmap.lroc.asu.edu/) | Lunar surface reference and site verification |
| [NASA Moon Trek](https://trek.nasa.gov/moon/) | Terrain and elevation data reference |
| [CSA Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/) | Lunar exploration context and mission planning resources |

---

## 👨‍💻 Team

**Lunar Selenix** — NASA Space Apps Challenge 2026

---

## 📜 License

This project was built for the NASA International Space Apps Challenge 2026. All ephemeris data is sourced from NASA's publicly available JPL Horizons System.

---

<p align="center">
  <b>Built with real orbital mechanics. No approximations. No static datasets.</b><br/>
  <i>Every number comes from JPL Horizons Live API.</i>
</p>