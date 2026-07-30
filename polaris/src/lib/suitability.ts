import type {
  HazardKey,
  HazardLevel,
  ServiceFactorKey,
  Site,
  SuitabilityClass,
} from "@/types/polaris";

/* ------------------------------------------------------------------ */
/*  Classification                                                     */
/* ------------------------------------------------------------------ */

export interface Thresholds {
  tau1: number;
  tau2: number;
  tau3: number;
}

/** Default thresholds; the dataset's own `metadata.thresholds` wins at runtime. */
export const DEFAULT_THRESHOLDS: Thresholds = { tau1: 0.25, tau2: 0.4, tau3: 0.6 };

export const SUITABILITY_CLASSES: SuitabilityClass[] = [
  "Highly Suitable",
  "Moderately Suitable",
  "Low Suitability",
  "Not Suitable",
];

/** CSS custom property per class — shared by badges, the legend and the map. */
export const CLASS_COLOR_VAR: Record<SuitabilityClass, string> = {
  "Highly Suitable": "--suit-high",
  "Moderately Suitable": "--suit-moderate",
  "Low Suitability": "--suit-low",
  "Not Suitable": "--suit-none",
};

/**
 * Static hex fallbacks. MapLibre paint expressions are evaluated inside a
 * WebGL shader and cannot read CSS custom properties, so the map layers need
 * literal colours. These track the oklch tokens in `index.css`.
 */
export const CLASS_HEX: Record<
  SuitabilityClass,
  { light: string; dark: string }
> = {
  "Highly Suitable": { light: "#1f9d55", dark: "#34d17f" },
  "Moderately Suitable": { light: "#2f86d4", dark: "#4fa8e8" },
  "Low Suitability": { light: "#d99413", dark: "#f0b429" },
  "Not Suitable": { light: "#d64545", dark: "#f06a6a" },
};

export const EXCLUDED_HEX = { light: "#94a3b8", dark: "#64748b" };

export function classifyScore(
  score: number,
  thresholds = DEFAULT_THRESHOLDS,
): SuitabilityClass {
  if (score >= thresholds.tau3) return "Highly Suitable";
  if (score >= thresholds.tau2) return "Moderately Suitable";
  if (score >= thresholds.tau1) return "Low Suitability";
  return "Not Suitable";
}

export function classRange(
  cls: SuitabilityClass,
  t = DEFAULT_THRESHOLDS,
): string {
  switch (cls) {
    case "Highly Suitable":
      return `${t.tau3.toFixed(2)} and above`;
    case "Moderately Suitable":
      return `${t.tau2.toFixed(2)} – ${t.tau3.toFixed(2)}`;
    case "Low Suitability":
      return `${t.tau1.toFixed(2)} – ${t.tau2.toFixed(2)}`;
    case "Not Suitable":
      return `below ${t.tau1.toFixed(2)}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Eligibility                                                        */
/* ------------------------------------------------------------------ */

/**
 * Whether a site sits inside the shoreline setback. Derived rather than
 * stored, so datasets produced by the training pipeline (which drops these
 * sites before scoring) and the migrated dataset (which keeps them so the
 * buffer can be drawn) both behave correctly.
 */
export function isShorelineExcluded(site: Site, bufferM: number): boolean {
  const d = site.factors.shoreline_distance_m;
  return d !== null && d < bufferM;
}

export function hasHighHazard(site: Site): boolean {
  return Object.values(site.hazards).some((level) => level === 3);
}

/** The single human-readable reason a site cannot be recommended, if any. */
export function ineligibilityReason(
  site: Site,
  bufferM: number,
): string | null {
  if (isShorelineExcluded(site, bufferM)) {
    const d = site.factors.shoreline_distance_m ?? 0;
    return `Inside the ${bufferM} m shoreline setback (${d.toFixed(0)} m from the coast)`;
  }
  const high = (Object.keys(site.hazards) as HazardKey[]).filter(
    (k) => site.hazards[k] === 3,
  );
  if (high.length > 0) {
    return `High ${high.map(hazardShortLabel).join(" and ")} susceptibility`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Factor + hazard vocabulary                                         */
/* ------------------------------------------------------------------ */

export const SERVICE_FACTOR_LABEL: Record<ServiceFactorKey, string> = {
  building_density: "Building footprint density",
  road_accessibility: "Road accessibility",
  facility_distance: "Distance from existing facilities",
};

export const SERVICE_FACTOR_HINT: Record<ServiceFactorKey, string> = {
  building_density:
    "Population proxy — OSM building footprints within 500 m. Higher means more residents to serve.",
  road_accessibility:
    "Normalized inverse distance to the road network. Values near 0 mean the site is FAR from mapped roads and therefore has LOW accessibility; values near 1 mean it sits right on the network.",
  facility_distance:
    "Service coverage gap — distance to the nearest existing healthcare facility. Higher means a larger unserved gap, which raises priority.",
};

export const HAZARD_LABEL: Record<HazardKey, string> = {
  flood_susceptibility: "Flood susceptibility",
  landslide_susceptibility: "Landslide susceptibility",
  storm_surge_susceptibility: "Storm surge susceptibility",
};

export function hazardShortLabel(key: HazardKey): string {
  return key.replace("_susceptibility", "").replace(/_/g, " ");
}

export const HAZARD_LEVEL_LABEL: Record<HazardLevel, string> = {
  0: "None",
  1: "Low",
  2: "Moderate",
  3: "High",
};

export const HAZARD_LEVEL_TONE: Record<HazardLevel, string> = {
  0: "text-suit-high",
  1: "text-suit-moderate",
  2: "text-suit-low",
  3: "text-suit-none",
};

/* ------------------------------------------------------------------ */
/*  Panel revision #7 — reading a near-zero road-accessibility value   */
/* ------------------------------------------------------------------ */

/**
 * Turns a normalized road-accessibility value into a sentence a non-technical
 * reader can act on. The panel specifically asked that a value such as 0.007
 * never be left to interpretation.
 */
export function describeRoadAccessibility(
  normalized: number,
  roadDistanceM?: number,
): string {
  const distance =
    roadDistanceM === undefined
      ? ""
      : ` The nearest mapped road is about ${formatMetres(roadDistanceM)} away.`;

  if (normalized <= 0.05) {
    return (
      `${normalized.toFixed(3)} is very close to 0, which means this site is among ` +
      `the FARTHEST from the mapped road network — accessibility is LOW.${distance}`
    );
  }
  if (normalized < 0.33) {
    return (
      `${normalized.toFixed(3)} is in the lower range, so the site is comparatively ` +
      `far from the road network and accessibility is limited.${distance}`
    );
  }
  if (normalized < 0.66) {
    return (
      `${normalized.toFixed(3)} is mid-range: the site has moderate access to the ` +
      `road network.${distance}`
    );
  }
  return (
    `${normalized.toFixed(3)} is close to 1, meaning the site sits on or beside the ` +
    `mapped road network — accessibility is HIGH.${distance}`
  );
}

/** Generic 0–1 reading used for the other service factors. */
export function describeNormalized(value: number): "Low" | "Moderate" | "High" {
  if (value <= 0.33) return "Low";
  if (value < 0.66) return "Moderate";
  return "High";
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

export function formatMetres(m: number): string {
  if (!Number.isFinite(m)) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function formatScore(score: number): string {
  return score.toFixed(3);
}

/* ------------------------------------------------------------------ */
/*  Score guide (panel revision #5)                                    */
/* ------------------------------------------------------------------ */

/**
 * Used only if a dataset somehow ships without `metadata.score_guide`. The
 * canonical text is authored in the training pipeline so the notebook, the
 * printed outputs and this app cannot drift apart.
 */
export const FALLBACK_SCORE_GUIDE =
  "Every site receives ONE composite suitability score between 0 and 1 that " +
  "already factors in all service criteria and all hazard penalties. Scores " +
  "closer to 1 indicate higher suitability; scores closer to 0 indicate lower " +
  "suitability.";

/** The short, scannable version shown in the legend and the welcome screen. */
export const SCORE_GUIDE_POINTS: { title: string; body: string }[] = [
  {
    title: "One score per site, from 0 to 1",
    body:
      "You do not need to weigh individual factors yourself. Each site carries a single " +
      "composite score that already combines population proxy, road accessibility, " +
      "coverage gap and every hazard penalty.",
  },
  {
    title: "Closer to 1 is better, closer to 0 is worse",
    body:
      "A score of 0.82 is a strong site. A score of 0.11 is a weak one. The same direction " +
      "applies to the individual factor values shown as supporting detail — including road " +
      "accessibility, where 0.007 means FAR from roads and therefore LOW accessibility.",
  },
  {
    title: "Hazard is already inside the score",
    body:
      "There is no separate 'without hazard' result to compare against. Flood, landslide and " +
      "storm surge susceptibility are subtracted from every score, and a site rated High on " +
      "any hazard is never recommended no matter how well it scores.",
  },
  {
    title: "Only the top three sites are surfaced",
    body:
      "The map scores the whole district, but the recommendation list is capped at three " +
      "eligible sites so the shortlist stays reviewable.",
  },
];
