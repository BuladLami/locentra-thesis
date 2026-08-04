# Prompt — revise the POLARIS training pipeline for the web app

Upload your current Google Colab training notebook alongside this file, then
paste everything below the line as your message to Claude.

---

You are revising the POLARIS training pipeline (the Colab notebook I have
uploaded). POLARIS is a GIS decision-support prototype for siting health
facilities in **Talomo District, Davao City**, built for a university thesis.

The React web app that consumes this pipeline's output is already built and
working. Your job is **only** to change the notebook so its export is correct,
complete and directly consumable by that app. Do not redesign the app, and do
not change the methodology except where this document asks.

## 1. Non-negotiables — do not undo these

These come from the proposal-defense panel. Breaking any of them breaks the
thesis, not just the code.

1. **Random Forest, never a neural network.** No TensorFlow, no Keras, no
   browser inference, no `model_a` / `model_b` directories.
2. **Exactly one composite score per site.** There is no "with hazard" /
   "without hazard" pair and no configuration flag that could reintroduce one.
   Hazard penalties are subtracted *inside* every score.
3. **The 50 m shoreline setback is a hard gate**, and it must be
   *demonstrable* — see §3, which changes how you export it.
4. **The recommendation list is capped** (`top_n_recommendations`, default 3).
5. **Road accessibility is a normalized inverse distance**: values near 0 mean
   FAR from roads and therefore LOW accessibility. Every piece of generated
   text must say this in plain language wherever the number appears.

## 2. The export contract — match this exactly

The app reads a single file, `candidate_sites.json`, and nothing else. It is
typed strictly, so a renamed or missing key is a runtime failure, not a
warning. Emit exactly this shape.

```jsonc
{
  "metadata": {
    "project": "POLARIS",
    "study_area": "Talomo District, Davao City",
    "model": "Random Forest (hazard-integrated, single configuration)",
    // OMIT "model_status" entirely for real Random Forest output. The app
    // renders a "Provisional dataset" warning badge whenever it equals
    // "provisional".
    "score_guide": "HOW TO READ SUITABILITY SCORES: ...",   // one string
    "thresholds": { "tau1": 0.25, "tau2": 0.4, "tau3": 0.6 },
    "weights": {
      "service": { "building_density": 0.4, "road_accessibility": 0.25, "facility_distance": 0.15 },
      "hazard_penalty": { "flood_susceptibility": 0.08, "landslide_susceptibility": 0.07, "storm_surge_susceptibility": 0.05 }
    },
    "shoreline_buffer_m": 50,
    "top_n_recommendations": 3,
    "dataset_clarification": {
      "raw_osm_records_extracted": 300000,     // integer, NOT null — see §5
      "training_candidate_sites": 3086,
      "shoreline_excluded_sites": 25,
      "note": "..."
    },
    "advisory_note": "...",
    "generated_at": "2026-08-04T12:00:00Z"
  },
  "top_recommendations": [ /* same fields as a site, plus recommendation_rank */ ],
  "sites": [ /* every scored site, see below */ ]
}
```

One site record, verbatim from the file the app runs on today:

```json
{
  "site_id": "TALOMO_2538",
  "latitude": 7.0977235184,
  "longitude": 125.5789064257,
  "barangay": "Ma-a",
  "score": 0.8292,
  "suitability_class": "Highly Suitable",
  "recommendation_level": 4,
  "recommendation_eligible": true,
  "interpretation": "This site obtained a composite suitability score of 0.829 — ...",
  "factors": {
    "building_density": 745,
    "road_distance_m": 237.2,
    "facility_distance_m": 342.4,
    "shoreline_distance_m": 5593.9
  },
  "factors_normalized": {
    "building_density": 0.7109,
    "road_accessibility": 0.0063,
    "facility_distance": 0.0828,
    "flood_susceptibility": 0.0,
    "landslide_susceptibility": 0.0,
    "storm_surge_susceptibility": 0.0
  },
  "hazards": {
    "flood_susceptibility": 0,
    "landslide_susceptibility": 0,
    "storm_surge_susceptibility": 0
  }
}
```

Rules the app depends on:

- `suitability_class` is one of exactly: `"Highly Suitable"`,
  `"Moderately Suitable"`, `"Low Suitability"`, `"Not Suitable"`.
- `hazards.*` are integers `0|1|2|3` (None / Low / Moderate / High).
- `factors_normalized.*` are floats in `[0, 1]`.
- `factors.shoreline_distance_m` may be `null` only if coastline data was
  genuinely unavailable — never omit the key.
- Round scores to 4 dp and metre distances to 1 dp. Leave lat/lon at full
  precision.

## 3. Required change — keep shoreline-excluded sites in the export

**This is the most important change.**

The notebook currently drops sites within 50 m of the coastline *before*
scoring, so they vanish from the export entirely. The consequence is that the
web app cannot show the buffer doing anything — the panel asked for this
constraint to be **demonstrable in the prototype**, and deleted rows
demonstrate nothing.

Change it to:

1. Compute `shoreline_distance_m` for **every** candidate site.
2. Compute the composite score for every site, but derive the min–max rescale
   **only from sites outside the buffer**, then clip the excluded ones into
   `[0, 1]`. This keeps the retained sites' scores identical to today.
3. Keep excluded sites in `sites[]` with:
   - `recommendation_eligible: false`
   - `recommendation_level: 0`
   - their real `shoreline_distance_m`
   - an `interpretation` that states they are inside the setback
4. Never let an excluded site enter `top_recommendations`.

Report the excluded count in
`metadata.dataset_clarification.shoreline_excluded_sites`. The app draws the
band from OSM coastline geometry and greys out these sites, so the constraint
becomes visible rather than asserted.

## 4. Required change — emit `barangay` per site

The app uses `barangay` for its search dropdown, its result cards and every
site dialog. The notebook does not produce it, so it currently has to be
back-filled outside the pipeline.

Assign it **from OpenStreetMap geometry, not coordinate ranges**:

1. Fetch `admin_level=10` boundary relations covering the district (Overpass,
   or OSMnx `features_from_place` with `{"boundary": "administrative",
   "admin_level": "10"}`).
2. Point-in-polygon each candidate site against those polygons.
3. Write the barangay `name` to `site.barangay`; use `null` if unmatched.

Do **not** reintroduce hardcoded latitude/longitude if-else ranges — that
approach was wrong and mislabelled sites. For reference, correct assignment
resolves all 3,086 sites across **14 barangays**.

## 5. Required change — report the raw OSM record count

Panel revision #6 asks you to distinguish two different quantities:

- **~300,000** raw OpenStreetMap records extracted for feature engineering
  (building footprints + road nodes + road edges + facilities)
- **~3,000+** candidate sites actually scored

The notebook already prints both. **Also write the raw count into
`metadata.dataset_clarification.raw_osm_records_extracted` as an integer.**
When it is `null` the app has to fall back to displaying the manuscript's
approximate figure, which is weaker evidence in a defense.

## 6. Strongly recommended — re-fetch OpenStreetMap before the final run

I measured the current dataset against a fresh Geofabrik Philippines extract
(2026-07-29), clipped to the same district polygon:

| Building density within 500 m | Stored (original run) | Fresh extract |
|---|---|---|
| Total across all sites | 199,157 | 558,721 |
| Maximum at any site | 1,048 | 2,232 |
| Sites higher / lower | — | **2,742 / 0** |

OSM building coverage in Talomo has grown roughly **+180%**, and not one site
decreased. Rank agreement is Spearman **ρ = 0.91** — the ordering broadly
survives, but there is real reshuffling.

Building density is the most heavily weighted feature (0.40), so the shipped
scores are based on a materially under-counted population proxy. Re-run the
OSM fetch before generating final results.

**Add this to the manuscript's limitations**, because it is a genuine finding:
that +180% is mostly *mapping coverage improving*, not buildings being built.
It demonstrates that "building footprint density as a population proxy" is
sensitive to OSM completeness, and you now have a hard number for it.

## 7. Recommended additions to `metadata`

These are additive and safe — the app ignores unknown keys, and they make the
defense stronger.

```jsonc
"validation": {
  "mae": 0.0123, "rmse": 0.0187, "r2": 0.9934,
  "spearman_rho": 0.998, "classification_change_rate_pct": 1.2
},
"feature_importances": {
  "building_density": 0.42, "road_accessibility": 0.21, "facility_distance": 0.14,
  "flood_susceptibility": 0.11, "landslide_susceptibility": 0.07,
  "storm_surge_susceptibility": 0.05
},
"osm_snapshot": "2026-07-29",
"random_state": 42
```

`feature_importances` is a Random Forest capability the old neural network did
not have — surfacing it is direct evidence for panel revision #1.

## 8. Text generation quality

`interpretation` is rendered as a paragraph in three places in the app. Keep it
readable:

- Short sentences. Avoid one 400-character run-on.
- Always spell out a near-zero road-accessibility value in words, e.g.
  *"the road-accessibility value of 0.006 is very close to zero, which means
  the site lies far from the mapped road network and is difficult to access."*
- Name the concrete drivers (which factors were strong, which weak, which
  hazards applied) rather than restating the score.
- State the exclusion reason explicitly when `recommendation_eligible` is
  false — shoreline setback or High hazard.

`score_guide` stays a single string; the app renders it verbatim as the
authoritative text so the notebook and the app cannot drift apart.

## 9. Acceptance checklist

Before finishing, verify and report:

- [ ] `candidate_sites.json` parses and has `metadata`, `top_recommendations`, `sites`
- [ ] Every site has all keys in §2, with no `undefined`/`NaN` values
- [ ] `metadata.model_status` is **absent**
- [ ] Shoreline-excluded sites are present, ineligible, and counted in metadata
- [ ] Every site has a non-null `barangay` (or a stated reason for nulls)
- [ ] `raw_osm_records_extracted` is an integer
- [ ] No site in `top_recommendations` is ineligible
- [ ] `suitability_class` values match the four exact strings
- [ ] File size reported (≈3.5 MB raw is fine; it gzips to ≈190 KB)

## 10. Deliverables

1. The revised notebook, with each change marked by a comment saying which
   section of this document it implements.
2. A short summary of what changed and any figure that moved materially from
   the previous run.
3. The regenerated `candidate_sites.json`.

To use the result, drop that file at `polaris/public/data/candidate_sites.json`
in the web app repository, replacing the existing one. No app code changes are
required if §2 is followed.
