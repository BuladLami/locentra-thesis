# Prompt — plain-language wording in the exported `candidate_sites.json`

Paste everything below the line into Claude, together with the notebook that
produces `outputs/webapp_export/candidate_sites.json`.

---

Follow-up to the POLARIS training notebook. This round changes **wording only**.
Do not touch the model, the weights, the thresholds, the scores, or any key name
in the exported JSON. Every number stays exactly as it is.

## 1. Why

The web app reads several free-text strings straight out of
`candidate_sites.json` and shows them to end users. Those users are health
officers and planning staff, not data scientists. The app's own copy has already
been rewritten in plain language, but the strings that come from the notebook
still read like a methods section, so the interface now mixes two registers.

A current example of `sites[].interpretation`:

> "This site in Barangay Talomo Proper obtained a **composite suitability score**
> of 0.302, placing it in the Low Suitability class. It has 1 **building
> footprints** within 300 m, a **normalized density** of 0.002, indicating very
> little built-up demand. The nearest **mapped road node** is 9.3 m away. The
> **road-accessibility value** of 0.095 is low, which means the site is some
> distance from the mapped road network. The nearest existing health facility is
> 610.9 m away, a moderate **service-coverage gap**. No flood, landslide or
> storm-surge hazard was recorded here, so no **hazard penalty** was applied."

This paragraph is the single most-read piece of text in the app — it appears in
the results list, the evaluation panel and the site detail dialog.

## 2. Strings to rewrite

| JSON path | Where it appears in the app |
|---|---|
| `sites[].interpretation` | Results list, evaluation panel, site detail dialog |
| `metadata.score_guide` | Score guide dialog, under "the technical version" |
| `metadata.advisory_note` | Welcome screen footer and score guide dialog |
| `metadata.dataset_clarification.note` | Data provenance dialog |
| `metadata.model` | Badge in the data provenance dialog |
| `metadata.model_note` (if present) | Data provenance dialog |

## 3. What counts as jargon here

Replace terms that only a developer or a data scientist would know. **Keep**
ordinary words and the domain vocabulary that planners and health officers
already use.

**Replace:**

| Instead of | Write |
|---|---|
| composite suitability score | suitability score, or just score |
| normalized density / normalized value | leave the 0–1 value, describe it as "on a 0 to 1 scale, where higher is better" |
| building footprints | buildings |
| mapped road node / road network | road |
| service-coverage gap | distance to the nearest existing health facility |
| hazard penalty applied | risk was subtracted from the score |
| population proxy | a stand-in for how many people live nearby |
| inverse distance | say the direction in words instead |
| feature engineering, lattice, grid, records extracted | plain description of what was counted |
| MCDA, Random Forest (in `model`) | see §5 |

**Keep as-is** — these are clear or are the vocabulary of the field:

- site, candidate site, suitability score, suitability class
- the four class names: Highly Suitable, Moderately Suitable, Low Suitability,
  Not Suitable
- barangay, district, shoreline, buffer, radius, metres
- flood, landslide, storm surge; the level names None / Low / Moderate / High
- recommend, recommendation, evaluate, evaluation

## 4. Rules for the rewritten `interpretation`

1. **Lead with the score and the class**, then the supporting factors. The score
   is the headline; the factors explain it.
2. **State the road-accessibility direction explicitly, every time.** A value
   near 0 means the site is FAR from any road and therefore HARD to reach. This
   is non-negotiable — a bare "0.095" has been misread before.
3. **Say the units in words**: "9.3 m from the nearest road", not "road node
   distance 9.3".
4. **Explain what a distance means**, not just what it is: "the nearest health
   facility is 610.9 m away, so this area is only partly served today".
5. **Name the hazard outcome plainly**: either "no flood, landslide or storm
   surge risk was recorded here" or "High flood risk here, which is why this
   site can never be recommended".
6. **Mention the shoreline rule only when it applies**, and say it in full: "this
   site is 31 m from the shoreline, closer than the 50 m minimum, so it can
   never be recommended".
7. Keep it to **three or four sentences**. It renders in a narrow sidebar.
8. Keep every number **identical to the current output**, including decimal
   places. Only the words around them change.

A rewrite of the example above, for calibration:

> "This site in Barangay Talomo Proper scores 0.302 out of 1, which puts it in
> the Low Suitability class. There is only 1 building within 300 m (0.002 on a
> 0 to 1 scale), so very few people live close enough to use a facility here.
> Its road accessibility of 0.095 is low: the site sits well back from the
> nearest road, 9.3 m away, and would be hard to reach. The nearest existing
> health facility is 610.9 m away, so the area is only partly served. No flood,
> landslide or storm surge risk was recorded here, so nothing was subtracted
> from the score."

## 5. The `metadata.model` string

It currently reads `"Random Forest (hazard-integrated, single configuration)"`
and is rendered as a badge to end users.

Keep the method name — this is a thesis artefact and the provenance matters —
but make the badge readable on its own. Write it as a short label plus a plain
gloss, for example:

```jsonc
"model": "Random Forest",
"model_note": "A Random Forest is a scoring method that combines many simple
  rules learned from the data. There is one configuration only: flood, landslide
  and storm surge risk are built into every score and cannot be switched off."
```

If `model_note` already exists, extend it rather than replacing it. The app
renders `model` as a badge and `model_note` as a paragraph beneath it, so the
gloss has somewhere to go.

## 6. Constraints

- **No key in `sites[]` or `metadata` may be renamed, added or removed** by this
  change, except `model_note` if it does not yet exist. The app is strictly
  typed against the current schema.
- **No number may change.** If a rewrite would require recomputing anything,
  stop and say so instead.
- The rewriting must happen in the **notebook cell that generates the strings**,
  so the next export carries it. Do not hand-edit the JSON file — it is
  regenerated on every run.
- Re-export `candidate_sites.json` afterwards and confirm the file still parses
  and still has the same site count.

## 7. Deliverables

1. The revised notebook cell(s) that build `interpretation` and the `metadata`
   strings.
2. The re-exported `candidate_sites.json`.
3. Three sample `interpretation` strings from the new export — one Highly
   Suitable site, one site ruled out by the shoreline rule, and one site ruled
   out by High hazard risk — so the wording can be checked against all three
   cases.
