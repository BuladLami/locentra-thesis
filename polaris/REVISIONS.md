# Panel revisions — where each one lives in the prototype

Traceability from the proposal-defense routing form to the code. Every item is
demonstrable in the running app, not just asserted in the manuscript.

| # | Revision | Where it is implemented |
|---|---|---|
| 1 | Neural network replaced with Random Forest | Whole app. `@tensorflow/tfjs` and `public/models/model_a`, `model_b` are deleted; no inference runs in the browser. The model is named in **Model and dataset** and on the welcome screen. |
| 2 | 50 m shoreline buffer demonstrable in the prototype | Real OSM coastline (`scripts/fetch-geodata.mjs`), per-site distance (`scripts/migrate-sites.mjs`), a true-to-scale band on the map (`ShorelineBufferLayer`), excluded sites greyed out, and a live excluded count in the legend and shortlist. |
| 3 | One composite score + textual interpretation, not just factor scores | `CompositeScore` leads every panel; `site.interpretation` is shown in the site dialog, the evaluation panel and each recommendation card. Factor values appear below, labelled *supporting detail*. |
| 4 | Limit displayed recommendations (e.g. three) | `metadata.top_n_recommendations` caps the shortlist and the numbered map markers. `RecommendationsPanel` states the cap and how many sites were ranked to produce it. |
| 5 | Upfront explanation of how to read scores | `ScoreGuideBody` renders on the **welcome screen before any number is visible**, and again from the header (**?**). The legend and the 0→1 track repeat the direction in place. |
| 6 | Clarify ~300,000 OSM records vs ~3,000+ training sites | **Model and dataset** dialog shows the two counts side by side with the note that they measure different things. |
| 7 | Interpretation of low road-accessibility values (e.g. 0.007) | `describeRoadAccessibility()` turns the number into a sentence wherever it is shown; called out separately in the score guide and in each site's generated interpretation. |
| 8 | Remove the "with hazard / without hazard" distinction | One score, one model. No config toggle exists. `pred_score_A` (service-only) is dropped in migration rather than relabelled, and hazard penalties are subtracted inside every score. Sites rated High on any hazard are gated out of recommendations entirely. |

## Notes on honesty of the shipped data

The pre-defense export contained neural-network outputs. Relabelling those as
Random Forest predictions would have been false, so `scripts/migrate-sites.mjs`
**recomputes** the composite score from the MCDA formulation in Section 5 of the
revised pipeline using the normalized factors in the legacy file. That is the
pseudo-target the Random Forest is trained against (Section 11 reports Spearman
ρ ≈ 1.0 between them), which makes it a faithful and fully reproducible stand-in.

The dataset labels itself `model_status: "provisional"` and the UI shows a
**Provisional dataset** badge until the file is replaced with the training
pipeline's own export.

## Additional changes made in the same pass

These were not routing-form items but were required by the revisions above or by
the brief.

- **TypeScript throughout.** Create React App (JavaScript) → Vite 7 + React 19 +
  TypeScript. CRA cannot run Tailwind v4 without ejecting, and mapcn requires
  Tailwind + shadcn/ui.
- **Leaflet → MapLibre GL** via mapcn's `@mapcn/map`, vendored at
  `src/components/ui/map.tsx`.
- **~3,000 sites render as one GPU circle layer**, not 3,000 DOM markers, so
  panning stays smooth.
- **Barangays come from OSM** (`admin_level=10` polygons, point-in-polygon
  assignment) instead of hardcoded latitude/longitude range guesses. All 3,086
  sites resolve, across 14 barangays.
- **Load-once rendering.** The dataset is fetched once and memoised at module
  scope; ranking runs only on an explicit button press, and the header Refresh
  is the only path that re-reads from the network.
- **No overlapping chrome.** The shell is a CSS grid — header, then map and
  sidebar as siblings. The sidebar owns its own scroll. The only floating
  element is the legend (bottom-left), which is collision-free with the zoom
  controls (top-right) and the attribution (bottom-right). The barangay
  suggestion list expands inline rather than floating, so it cannot overlap the
  controls beneath it or be clipped by the scroll container.
- **Mode switching preserves state.** Recommendation and evaluation inputs are
  independent, so switching modes destroys nothing — which removed the need for
  the old "are you sure?" confirmation dialogs.
