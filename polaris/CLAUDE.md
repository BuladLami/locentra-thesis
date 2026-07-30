# POLARIS — Claude Code Guide

## Project Overview

**POLARIS** is a React + TypeScript geospatial decision-support app (thesis
prototype) for siting health facilities in **Talomo District, Davao City**.

Two modes:
- **Recommendation** — ranks candidate sites inside a search radius and surfaces
  the top three *eligible* ones.
- **Evaluation** — reports the composite score for one specific coordinate.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript, Vite 7 |
| Map | mapcn `@mapcn/map` on MapLibre GL 5 |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) primitives |
| Model | Random Forest, trained offline in Colab |
| Data | Static JSON in `public/data/` — no backend, no browser inference |
| Deploy | Vercel (`outputDirectory: build`) |

## Non-negotiables

These come from the proposal-defense panel. Do not undo them. See
[REVISIONS.md](REVISIONS.md) for the full mapping.

1. **Random Forest, never a neural network.** No TensorFlow.js, no `model_a` /
   `model_b`, no browser inference.
2. **One composite score per site.** There is no "without hazard" variant to
   compare against, and no config toggle may reintroduce one. Hazard penalties
   live inside the score.
3. **Score first, factors second.** Any view showing a site leads with the
   composite score and its `interpretation` string; factor values are labelled
   supporting detail.
4. **Recommendations are capped** at `metadata.top_n_recommendations` (3).
5. **The score guide is upfront** — on the welcome screen before any number is
   rendered, and from the header at any time.
6. **The 50 m shoreline setback is a hard gate** and must stay visible on the map.
7. **Road accessibility near 0 means FAR from roads / LOW accessibility.** Never
   present that value without the reading.

## Architecture

- `src/App.tsx` — orchestration and all app state. Modes keep independent state
  so switching loses nothing.
- `src/lib/dataset.ts` — **load-once** data access. Memoised at module scope;
  `reloadBundle()` is the only path that re-fetches, driven by the header
  Refresh button.
- `src/lib/suitability.ts` — the shared vocabulary: thresholds, class colours,
  factor labels/hints, `describeRoadAccessibility`, score-guide copy.
- `src/components/ui/map.tsx` — **vendored from mapcn**. Treat as third-party;
  re-pull from the registry rather than hand-editing.
- `src/components/map/use-map-source.ts` — the supported extension point for
  layers mapcn does not express (circle layers, width-scaled lines). Composes on
  `useMap()`.
- `src/types/polaris.ts` — mirrors the training pipeline's export schema. If the
  notebook's schema changes, change this first.

### Rendering rules

- Nothing recalculates on pan/zoom. Ranking happens only inside
  `runRecommendation`, called from the button.
- ~3,000 sites render as **one MapLibre circle layer**, not DOM markers. Only
  the top-3 and the search/eval point are real markers.
- MapLibre paint expressions run in a shader and cannot read CSS custom
  properties — map colours come from `CLASS_HEX` in `suitability.ts`, which
  tracks the oklch tokens in `index.css`. Update both together.

### Layout rules

The shell is a CSS grid: header row, then map + sidebar as siblings. The sidebar
owns its own scroll. The only floating element over the map is the legend
(bottom-left). Keep it that way — the brief explicitly asks for no overlapping
elements. Dropdowns inside the sidebar expand **inline**, never absolutely, so
they cannot be clipped by the scroll container.

## Common Commands

```bash
npm run dev          # dev server, http://localhost:3000
npm run build        # tsc -b && vite build  →  /build
npm run typecheck    # tsc -b --noEmit
npm run data:build   # refetch OSM geometry + rebuild candidate_sites.json
```

## Data

`public/data/candidate_sites.json` is the only file the app needs. It is either:

- the training pipeline's own export (`outputs/webapp_export/candidate_sites.json`), or
- the migrated bridge dataset from `scripts/migrate-sites.mjs`, which is labelled
  `model_status: "provisional"` and shows a badge in the UI.

Both use the same schema. `scripts/migrate-sites.mjs` recomputes scores from the
MCDA formulation rather than reusing the old neural-network numbers — do not
"simplify" it into copying `pred_score_B`.

## Domain Context

- Study area: Talomo District, Davao City — OSM relation 19143671.
- Barangays are assigned by point-in-polygon against OSM `admin_level=10`
  polygons. Do not reintroduce latitude/longitude range heuristics.
- Coordinates are WGS84; distances use the haversine formula.
