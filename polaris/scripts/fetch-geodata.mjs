/**
 * fetch-geodata.mjs
 * ---------------------------------------------------------------------------
 * Downloads the reference geometry the prototype needs from OpenStreetMap and
 * writes it to `public/data/`:
 *
 *   talomo_boundary.json   — the Talomo District administrative boundary
 *                            (Nominatim, same source as the notebook's
 *                            `ox.geocode_to_gdf('Talomo, Davao City, ...')`)
 *   talomo_coastline.json  — `natural=coastline` ways around the district
 *                            (Overpass), used to compute and draw the
 *                            50-metre shoreline exclusion buffer.
 *   talomo_barangays.json  — admin_level=10 boundary relations (Overpass),
 *                            used to give every scored site a real barangay
 *                            name instead of a coordinate-range guess.
 *   talomo_facilities.json — existing health facilities (Overpass), so the
 *                            `facility_distance_m` every site reports has a
 *                            visible referent on the map instead of being a
 *                            number the user has to take on trust.
 *
 * All four are real OSM geometry — nothing here is hand-drawn. If a fetch
 * fails, the existing file on disk is left untouched so an offline run never
 * silently degrades the dataset.
 *
 * Usage:  npm run data:geo
 */

import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(import.meta.dirname, "..", "public", "data");

// Generous bbox around Talomo District, Davao City (south, west, north, east).
const BBOX = { south: 6.95, west: 125.4, north: 7.15, east: 125.72 };

const USER_AGENT =
  "POLARIS-thesis-prototype/2.0 (University of the Immaculate Conception)";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Boundary — Nominatim                                               */
/* ------------------------------------------------------------------ */

function coordSpan(geometry) {
  const flat = (function walk(c) {
    return typeof c[0] === "number" ? [c] : c.flatMap(walk);
  })(geometry.coordinates);
  const lons = flat.map((p) => p[0]);
  const lats = flat.map((p) => p[1]);
  return {
    width: Math.max(...lons) - Math.min(...lons),
    height: Math.max(...lats) - Math.min(...lats),
  };
}

async function nominatimSearch(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("limit", "5");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return res.json();
}

async function fetchBoundary() {
  // "Talomo" alone resolves to the *barangay* Talomo Proper, which is only a
  // fraction of the study area. Ask for the district explicitly, and reject
  // any hit too small to be the district (< ~0.05 deg across, ~5.5 km).
  const queries = [
    "Talomo District, Davao City, Philippines",
    "Talomo, Davao City, Philippines",
  ];
  const MIN_SPAN_DEG = 0.05;

  let polygon;
  for (const query of queries) {
    const hits = await nominatimSearch(query);
    polygon = hits.find((h) => {
      if (!h.geojson) return false;
      if (h.geojson.type !== "Polygon" && h.geojson.type !== "MultiPolygon") {
        return false;
      }
      const { width, height } = coordSpan(h.geojson);
      return width >= MIN_SPAN_DEG && height >= MIN_SPAN_DEG;
    });
    if (polygon) break;
    await new Promise((r) => setTimeout(r, 1200));
  }

  if (!polygon) {
    throw new Error("Nominatim returned no district-sized polygon geometry");
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: polygon.display_name,
          osm_type: polygon.osm_type,
          osm_id: polygon.osm_id,
          source: "OpenStreetMap via Nominatim",
        },
        geometry: polygon.geojson,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Coastline — Overpass                                               */
/* ------------------------------------------------------------------ */

async function fetchCoastline() {
  const query = `
    [out:json][timeout:90];
    way["natural"="coastline"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    out geom;
  `;

  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

      const json = await res.json();
      const features = (json.elements ?? [])
        .filter((el) => el.type === "way" && Array.isArray(el.geometry))
        .map((el) => ({
          type: "Feature",
          properties: { osm_id: el.id, natural: "coastline" },
          geometry: {
            type: "LineString",
            coordinates: el.geometry.map((p) => [p.lon, p.lat]),
          },
        }));

      if (features.length === 0) {
        throw new Error("Overpass returned no coastline ways for the bbox");
      }

      return {
        type: "FeatureCollection",
        properties: {
          source: "OpenStreetMap via Overpass API",
          query_bbox: BBOX,
          fetched_at: new Date().toISOString(),
        },
        features,
      };
    } catch (err) {
      lastError = err;
      console.warn(`   ! ${endpoint} failed: ${err.message}`);
    }
  }
  throw lastError ?? new Error("All Overpass endpoints failed");
}

/* ------------------------------------------------------------------ */
/*  Barangays — Overpass (admin_level 10)                              */
/* ------------------------------------------------------------------ */

/**
 * Stitches the `outer` member ways of an OSM boundary relation into closed
 * rings. OSM returns a relation's ways in arbitrary order and direction, so
 * we walk endpoints and reverse segments as needed.
 */
function stitchRings(members) {
  const segments = members
    .filter((m) => m.type === "way" && Array.isArray(m.geometry))
    .filter((m) => m.role === "outer" || m.role === "" || m.role == null)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));

  const key = (pt) => `${pt[0].toFixed(7)},${pt[1].toFixed(7)}`;
  const rings = [];
  const pool = [...segments];

  while (pool.length > 0) {
    let ring = pool.shift();
    let extended = true;

    while (extended && key(ring[0]) !== key(ring[ring.length - 1])) {
      extended = false;
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        const tail = ring[ring.length - 1];
        if (key(seg[0]) === key(tail)) {
          ring = ring.concat(seg.slice(1));
        } else if (key(seg[seg.length - 1]) === key(tail)) {
          ring = ring.concat(seg.slice(0, -1).reverse());
        } else {
          continue;
        }
        pool.splice(i, 1);
        extended = true;
        break;
      }
    }

    // Only keep rings that actually closed and enclose an area.
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) {
      rings.push(ring);
    }
  }
  return rings;
}

async function overpass(query) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      console.warn(`   ! ${endpoint} failed: ${err.message}`);
    }
  }
  throw lastError ?? new Error("All Overpass endpoints failed");
}

async function fetchBarangays() {
  const query = `
    [out:json][timeout:120];
    relation["boundary"="administrative"]["admin_level"="10"]
      (${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    out geom;
  `;

  const json = await overpass(query);
  const features = [];

  for (const rel of json.elements ?? []) {
    if (rel.type !== "relation" || !Array.isArray(rel.members)) continue;
    const name = rel.tags?.name;
    if (!name) continue;

    const rings = stitchRings(rel.members);
    if (rings.length === 0) continue;

    features.push({
      type: "Feature",
      properties: { name, osm_id: rel.id, admin_level: 10 },
      geometry:
        rings.length === 1
          ? { type: "Polygon", coordinates: [rings[0]] }
          : { type: "MultiPolygon", coordinates: rings.map((r) => [r]) },
    });
  }

  if (features.length === 0) {
    throw new Error("Overpass returned no usable barangay polygons");
  }

  features.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
  return {
    type: "FeatureCollection",
    properties: {
      source: "OpenStreetMap via Overpass API (admin_level=10)",
      fetched_at: new Date().toISOString(),
    },
    features,
  };
}

/* ------------------------------------------------------------------ */
/*  Existing health facilities — Overpass                              */
/* ------------------------------------------------------------------ */

/**
 * Care-delivery points only. Pharmacies and dental surgeries are deliberately
 * excluded: the model's `facility_distance_m` measures the gap in *health
 * service coverage*, so plotting retail or specialist-only points would put
 * markers on the map that the score never counted.
 */
const FACILITY_AMENITY = ["hospital", "clinic", "doctors", "health_post"];
const FACILITY_HEALTHCARE = [
  "hospital",
  "clinic",
  "centre",
  "doctor",
  "health_post",
];

/* ---- Clipping to the district ---- */

/** Ray-casting test against a single linear ring. */
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Point-in-polygon against a Polygon or MultiPolygon, honouring holes: ring 0
 * of each polygon is the outer boundary and any further rings are cut out.
 */
function pointInGeometry(point, geometry) {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  return polygons.some((rings) => {
    if (!pointInRing(point, rings[0])) return false;
    return !rings.slice(1).some((hole) => pointInRing(point, hole));
  });
}

/**
 * Loads the district polygon written earlier in this run. Returns null when it
 * is missing so the caller can fall back to the unclipped set rather than
 * silently emitting an empty layer.
 */
async function loadBoundaryGeometry() {
  try {
    const raw = await readFile(
      path.join(OUT_DIR, "talomo_boundary.json"),
      "utf8",
    );
    return JSON.parse(raw).features?.[0]?.geometry ?? null;
  } catch {
    return null;
  }
}

/** Human-readable kind, preferring the more specific tag. */
function facilityKind(tags) {
  const raw = tags.amenity ?? tags.healthcare ?? "";
  const map = {
    hospital: "Hospital",
    clinic: "Clinic",
    // OSM tags many barangay health centres as `amenity=doctors`. "Doctor's
    // surgery" is the British reading of that tag and misdescribes them, so
    // use the neutral term that fits both.
    doctors: "Doctor's clinic",
    doctor: "Doctor's clinic",
    health_post: "Health post",
    centre: "Health centre",
  };
  return map[raw] ?? "Health facility";
}

async function fetchFacilities() {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const amenity = FACILITY_AMENITY.join("|");
  const healthcare = FACILITY_HEALTHCARE.join("|");

  // `out center` collapses building polygons to a single point, so a hospital
  // mapped as a way and one mapped as a node are treated identically.
  const query = `
    [out:json][timeout:120];
    (
      node["amenity"~"^(${amenity})$"](${bbox});
      way["amenity"~"^(${amenity})$"](${bbox});
      relation["amenity"~"^(${amenity})$"](${bbox});
      node["healthcare"~"^(${healthcare})$"](${bbox});
      way["healthcare"~"^(${healthcare})$"](${bbox});
      relation["healthcare"~"^(${healthcare})$"](${bbox});
    );
    out center tags;
  `;

  const json = await overpass(query);

  // Overpass is queried on a bbox that overhangs the district on every side,
  // so clip to the actual polygon. Without this the layer would show facilities
  // across neighbouring districts that are not part of the study area.
  const boundary = await loadBoundaryGeometry();
  if (!boundary) {
    console.warn(
      "   !  talomo_boundary.json unavailable — keeping the full bbox set.",
    );
  }

  const features = [];
  const seen = new Set();
  let outside = 0;

  for (const el of json.elements ?? []) {
    const lon = el.lon ?? el.center?.lon;
    const lat = el.lat ?? el.center?.lat;
    if (typeof lon !== "number" || typeof lat !== "number") continue;

    if (boundary && !pointInGeometry([lon, lat], boundary)) {
      outside += 1;
      continue;
    }

    // The same facility can be tagged on both a node and its building way.
    // Collapse anything landing on the same ~10 m spot to one marker.
    const dedupe = `${lon.toFixed(4)},${lat.toFixed(4)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const tags = el.tags ?? {};
    features.push({
      type: "Feature",
      properties: {
        name: tags.name ?? null,
        kind: facilityKind(tags),
        amenity: tags.amenity ?? null,
        healthcare: tags.healthcare ?? null,
        osm_type: el.type,
        osm_id: el.id,
      },
      geometry: { type: "Point", coordinates: [lon, lat] },
    });
  }

  if (features.length === 0) {
    throw new Error("Overpass returned no health facilities inside the district");
  }

  // Named facilities first, alphabetically; the unnamed ones trail behind
  // rather than heading the file with a block of blanks.
  features.sort((a, b) => {
    const an = a.properties.name;
    const bn = b.properties.name;
    if (an && bn) return an.localeCompare(bn);
    if (an) return -1;
    if (bn) return 1;
    return 0;
  });

  if (boundary) {
    console.log(`       Clipped to the district: ${outside} outside dropped.`);
  }

  return {
    type: "FeatureCollection",
    properties: {
      source: "OpenStreetMap via Overpass API",
      query_bbox: BBOX,
      clipped_to: boundary ? "Talomo District boundary" : null,
      excluded_outside_district: boundary ? outside : 0,
      amenity_classes: FACILITY_AMENITY,
      healthcare_classes: FACILITY_HEALTHCARE,
      fetched_at: new Date().toISOString(),
    },
    features,
  };
}

/* ------------------------------------------------------------------ */

async function writeOrKeep(filename, producer, label) {
  const target = path.join(OUT_DIR, filename);
  try {
    const data = await producer();
    await writeFile(target, JSON.stringify(data), "utf8");
    const count = data.features?.length ?? 0;
    console.log(`   OK  ${label}: ${count} feature(s) -> public/data/${filename}`);
    return true;
  } catch (err) {
    const kept = await exists(target);
    console.warn(`   !!  ${label} fetch failed: ${err.message}`);
    console.warn(
      kept
        ? `       Keeping the existing public/data/${filename}.`
        : `       No existing file — the prototype will run without it.`,
    );
    return false;
  }
}

const TARGETS = [
  ["boundary", "talomo_boundary.json", fetchBoundary, "Talomo boundary"],
  ["coastline", "talomo_coastline.json", fetchCoastline, "OSM coastline"],
  ["barangays", "talomo_barangays.json", fetchBarangays, "Barangays"],
  ["facilities", "talomo_facilities.json", fetchFacilities, "Health facilities"],
];

async function main() {
  // Named arguments refetch a subset. Re-pulling everything to add one layer
  // risks disturbing geometry that is already correct, so `... facilities`
  // exists to touch exactly one file.
  const requested = process.argv.slice(2);
  const targets = requested.length
    ? TARGETS.filter(([name]) => requested.includes(name))
    : TARGETS;

  if (targets.length === 0) {
    console.error(
      `Unknown target(s): ${requested.join(", ")}\n` +
        `Valid targets: ${TARGETS.map(([n]) => n).join(", ")}`,
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log("POLARIS — fetching OSM reference geometry\n");

  for (const [, filename, producer, label] of targets) {
    await writeOrKeep(filename, producer, label);
    // Be polite to Nominatim/Overpass: stagger the requests.
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
