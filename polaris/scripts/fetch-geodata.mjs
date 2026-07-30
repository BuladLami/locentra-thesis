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
 *
 * All three are real OSM geometry — nothing here is hand-drawn. If a fetch
 * fails, the existing file on disk is left untouched so an offline run never
 * silently degrades the dataset.
 *
 * Usage:  npm run data:geo
 */

import { writeFile, mkdir, access } from "node:fs/promises";
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log("POLARIS — fetching OSM reference geometry\n");

  await writeOrKeep("talomo_boundary.json", fetchBoundary, "Talomo boundary");
  // Be polite to Nominatim/Overpass: stagger the requests.
  await new Promise((r) => setTimeout(r, 1200));
  await writeOrKeep("talomo_coastline.json", fetchCoastline, "OSM coastline");
  await new Promise((r) => setTimeout(r, 1200));
  await writeOrKeep("talomo_barangays.json", fetchBarangays, "Barangays");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
