# POLARIS — Claude Code Guide

## Project Overview

**POLARIS** is a React-based geospatial decision-support web app built as a thesis project. It helps identify and evaluate suitable health center sites within the **Talomo District, Davao City, Philippines**.

The system has two main modes:
- **Recommendation Mode** — finds and ranks potential health center sites within a search radius based on suitability scores
- **Evaluation Mode** — evaluates a specific coordinate for health center suitability

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (Create React App) |
| Map | Leaflet + React-Leaflet v5 |
| ML/Scoring | TensorFlow.js v4 |
| Deployment | Vercel (SPA rewrites via `vercel.json`) |
| Styling | Plain CSS (`App.css`) with glass morphism + gradient design |

## Project Structure

```
polaris/
├── src/
│   ├── App.js        # All UI and logic lives here (single-file app)
│   └── App.css       # All styles
├── public/           # Static assets and site data JSON
├── vercel.json       # SPA rewrite rules for Vercel
└── DESIGN_UPDATES.md # Design changelog (SAGIP-inspired theme)
```

## Key Design Decisions

- **Single-file architecture**: All components and logic are in `src/App.js`. Do not split into separate files unless explicitly asked.
- **Data source**: Site data is loaded from a JSON file in `public/` — no backend or database.
- **No global state library**: State is managed with `useState`/`useEffect` only.
- **Scoring system**:
  - `< 0.25` → Very Low (red `#d73027`)
  - `0.25–0.40` → Low (orange `#fc8d59`)
  - `0.40–0.60` → Moderate (yellow `#fee08b`)
  - `≥ 0.60` → High (green `#1a9850`)
- **Recommendation levels** (from score):
  - `≥ 0.6` → Level 3: Highly Suitable
  - `0.4–0.6` → Level 2: Moderately Suitable
  - `0.2–0.4` → Level 1: Conditionally Suitable
  - `< 0.2` → Level 0: Not Suitable

## Common Commands

```bash
npm start       # Dev server at http://localhost:3000
npm run build   # Production build to /build
npm test        # Run tests
```

## Domain Context

- Study area: Talomo District, Davao City (approx. lat 7.02–7.10, lon 125.46–125.62)
- Barangays covered: Talomo Proper, Ma-a, Bago Aplaya, Catalunan Grande, Matina Crossing, Matina
- Coordinates use WGS84 (standard lat/lon)
- Distance calculations use the Haversine formula

## Style Guide

- **Color scheme**: Purple-to-blue gradient (`#667eea` → `#764ba2`)
- **UI pattern**: Glass morphism panels with `backdrop-filter: blur`
- **Buttons**: Gradient background, `translateY` hover animation, uppercase text
- **Map markers**: `CircleMarker` components from react-leaflet
