# Follow-up prompt — strengthening POLARIS input data sources

Send this **after** `TRAINING_REVISION_PROMPT.md` has been applied and the
notebook is producing a valid export. Paste everything below the line.

---

Follow-up to the revision you just made to the POLARIS training notebook.

This round is about **where the input features come from**, not about the model
or the export format. Keep the export contract from the previous prompt exactly
as it is.

## 1. The problem to solve

Three of the model's four service inputs come from OpenStreetMap, and OSM is
volunteer-contributed. That matters most for the population proxy, which
carries the largest weight in the composite score (0.40).

I measured the current dataset against a fresh Geofabrik Philippines extract
(2026-07-29), both clipped to the same Talomo District polygon:

| Building density within 500 m | Original run | 2026-07-29 extract |
|---|---|---|
| Total across all sites | 199,157 | 558,721 |
| Maximum at any site | 1,048 | 2,232 |
| Sites higher / lower | — | **2,742 / 0** |
| Rank agreement | — | Spearman ρ = 0.91 |

Coverage roughly **tripled**, and not one site went down. Almost none of that
is new construction — it is **mapping activity**, i.e. volunteers digitising
buildings that already existed.

So the population proxy partly measures *how well Talomo has been mapped*
rather than *how many people live there*. A defense panel can reasonably
challenge that. The purpose of this round is to answer the challenge with
evidence rather than to argue about it.

## 2. What to keep on OpenStreetMap

Do not replace these — nothing else has comparable coverage for Davao City:

- **Road network** → `road_distance_m` / `road_accessibility`
- **District boundary** → the candidate-site grid extent

## 3. Candidate substitutions to evaluate

For each one, assess feasibility and licensing, then implement it **only if it
is genuinely obtainable and better**. If a source turns out to be unavailable,
paywalled, or lower quality, say so plainly and keep the OSM version — do not
substitute something worse to satisfy this prompt.

| Input | Proposed source | Notes |
|---|---|---|
| Population proxy (0.40) | **WorldPop** 100 m constrained, PHL; or **Meta High-Resolution Population Density** via HDX | Modelled population estimates rather than a building count |
| Healthcare facilities (0.15) | **DOH National Health Facility Registry (NHFR)** | Authoritative and licensed, vs volunteer `amenity` tags |
| Barangay boundaries | **PSA** or **PhilGIS** official shapefiles | Citable provenance; OSM `admin_level=10` is unofficial |
| Coastline (50 m buffer) | **NAMRIA** topographic data | National mapping agency |

**Be honest about one caveat**: WorldPop and Meta HRSL are themselves *modelled*
products, and their settlement layers are partly derived from satellite imagery
plus OSM. Switching to them reduces the mapping-completeness problem — it does
not eliminate it. State this in the limitations rather than overclaiming
independence.

## 4. Required — run it as a comparison, not a blind swap

Changing the population proxy changes what the model means, so it has to be
justified, not just performed. Produce a **sensitivity analysis**:

1. Keep the OSM-based run as the baseline.
2. Produce a second run with the substituted source(s).
3. Compare and report:
   - Spearman ρ between the two site rankings
   - How many sites change `suitability_class`, and in which direction
   - Whether the top 3 recommended sites change, and if so, how far the old
     ones fell
   - Correlation between OSM building density and the new population estimate
     across all sites

If the two rankings agree closely, that is a **strong result** — it shows the
recommendation is robust to the choice of proxy. If they diverge, that is also
a real finding and belongs in the discussion. Either outcome is publishable;
report whichever you actually get.

## 5. Record provenance in the export

Add to `metadata` (additive — the app ignores unknown keys):

```jsonc
"data_sources": {
  "population_proxy": { "name": "WorldPop 100 m constrained (PHL)", "year": 2025, "url": "...", "licence": "CC BY 4.0" },
  "road_network":     { "name": "OpenStreetMap", "snapshot": "2026-07-29", "licence": "ODbL" },
  "facilities":       { "name": "DOH National Health Facility Registry", "retrieved": "2026-08-04" },
  "barangays":        { "name": "PSA administrative boundaries", "year": 2024 },
  "coastline":        { "name": "NAMRIA", "year": 2023 },
  "hazards":          { "name": "Project NOAH + ph112402000 flood SHP" }
}
```

Every source needs a licence field. This is a thesis artefact; unattributed
data is a problem regardless of how good it is.

## 6. Keep the JSON keys stable

**Do not rename any field in `sites[]`.** The web app is strictly typed against
the contract from the previous prompt, so `factors.building_density` and
`factors_normalized.building_density` must keep those exact names even if the
underlying source is no longer a building count.

Instead, tell the app what to *call* it by adding:

```jsonc
"factor_labels": {
  "building_density": {
    "label": "Population density (WorldPop)",
    "hint": "Modelled residents per 100 m cell, summed within 500 m of the site.",
    "raw_unit": "residents"
  }
}
```

Flag clearly in your summary that the app currently hardcodes the label
"Building footprint density" and the hint "OSM building footprints within
500 m". If the source changes, that copy is wrong until the app is updated to
read `factor_labels`. That is a small app change, but it must not be forgotten
— a mislabelled factor is worse than an unchanged one.

## 7. Acceptance checklist

- [ ] Each proposed source assessed, with a clear keep-or-replace decision and reason
- [ ] Sources actually used are licensed for academic use, with the licence recorded
- [ ] Baseline (OSM) run preserved for comparison
- [ ] Sensitivity analysis reported: ρ, class changes, top-3 stability, proxy correlation
- [ ] `metadata.data_sources` populated for every input, including hazards
- [ ] `metadata.factor_labels` added if any factor's meaning changed
- [ ] No key in `sites[]` renamed; export still validates against the previous contract
- [ ] Limitations text updated, including the caveat that WorldPop/HRSL are modelled

## 8. Deliverables

1. The revised notebook, with the substitution logic behind a clear switch so
   both runs can be reproduced.
2. The sensitivity analysis as a short table plus two or three sentences of
   interpretation suitable for the manuscript's discussion section.
3. Both `candidate_sites.json` files — baseline and substituted — clearly named.
4. A one-paragraph limitations update.
 