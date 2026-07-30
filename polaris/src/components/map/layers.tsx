import { useEffect, useMemo } from "react";
import type MapLibreGL from "maplibre-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

import { useMap } from "@/components/ui/map";
import {
  metresToPixelsExpression,
  useMapSource,
} from "@/components/map/use-map-source";
import type { Theme } from "@/hooks/use-theme";
import type { Site, SuitabilityClass } from "@/types/polaris";
import { CLASS_HEX, EXCLUDED_HEX, isShorelineExcluded } from "@/lib/suitability";

/** Reference latitude for ground-distance-to-pixel conversions in Talomo. */
const REF_LAT = 7.05;

const CLASS_INDEX: Record<SuitabilityClass, number> = {
  "Not Suitable": 0,
  "Low Suitability": 1,
  "Moderately Suitable": 2,
  "Highly Suitable": 3,
};

/* ================================================================== */
/*  District boundary                                                  */
/* ================================================================== */

export function BoundaryLayer({
  data,
  theme,
}: {
  data: FeatureCollection | null;
  theme: Theme;
}) {
  const layers = useMemo(
    () => [
      {
        id: "talomo-boundary-line",
        type: "line" as const,
        paint: {
          "line-color": theme === "dark" ? "#8b9bd4" : "#4c5fa8",
          "line-width": 1.6,
          "line-opacity": 0.9,
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "talomo-boundary-fill",
        type: "fill" as const,
        paint: {
          "fill-color": theme === "dark" ? "#8b9bd4" : "#4c5fa8",
          "fill-opacity": 0.05,
        },
      },
    ],
    [theme],
  );

  useMapSource("talomo-boundary", data, layers);
  return null;
}

/* ================================================================== */
/*  50 m shoreline exclusion buffer (panel revision #2)                */
/* ================================================================== */

/**
 * Draws the shoreline setback as a band whose on-screen width tracks a true
 * `bufferM` metres on either side of the OSM coastline, so the constraint is
 * literally visible at every zoom level rather than merely asserted.
 */
export function ShorelineBufferLayer({
  data,
  bufferM,
  theme,
  visible,
}: {
  data: FeatureCollection | null;
  bufferM: number;
  theme: Theme;
  visible: boolean;
}) {
  const layers = useMemo(() => {
    const bandColor = theme === "dark" ? "#f0776a" : "#d64545";
    return [
      {
        id: "shoreline-buffer-band",
        type: "line" as const,
        layout: {
          "line-cap": "round" as const,
          "line-join": "round" as const,
          visibility: (visible ? "visible" : "none") as "visible" | "none",
        },
        paint: {
          "line-color": bandColor,
          // Doubled: the setback extends bufferM to *each* side of the line.
          "line-width": metresToPixelsExpression(bufferM * 2, REF_LAT),
          "line-opacity": 0.22,
        },
      },
      {
        id: "shoreline-coastline",
        type: "line" as const,
        layout: {
          "line-cap": "round" as const,
          "line-join": "round" as const,
          visibility: (visible ? "visible" : "none") as "visible" | "none",
        },
        paint: {
          "line-color": bandColor,
          "line-width": 1.2,
          "line-opacity": 0.75,
        },
      },
    ];
  }, [bufferM, theme, visible]);

  useMapSource("shoreline", data, layers);
  return null;
}

/* ================================================================== */
/*  Candidate site dots                                                */
/* ================================================================== */

export interface SitePointProperties {
  site_id: string;
  cls: number;
  excluded: number;
  eligible: number;
  score: number;
}

export function sitesToFeatureCollection(
  sites: readonly Site[],
  bufferM: number,
): FeatureCollection<Point, SitePointProperties> {
  return {
    type: "FeatureCollection",
    features: sites.map((site) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [site.longitude, site.latitude] },
      properties: {
        site_id: site.site_id,
        cls: CLASS_INDEX[site.suitability_class],
        excluded: isShorelineExcluded(site, bufferM) ? 1 : 0,
        eligible: site.recommendation_eligible ? 1 : 0,
        score: site.score,
      },
    })),
  };
}

function classColorExpression(theme: Theme): MapLibreGL.ExpressionSpecification {
  const tone = (c: SuitabilityClass) => CLASS_HEX[c][theme];
  return [
    "case",
    ["==", ["get", "excluded"], 1],
    EXCLUDED_HEX[theme],
    [
      "match",
      ["get", "cls"],
      3,
      tone("Highly Suitable"),
      2,
      tone("Moderately Suitable"),
      1,
      tone("Low Suitability"),
      tone("Not Suitable"),
    ],
  ] as MapLibreGL.ExpressionSpecification;
}

/**
 * All ~3,000 scored candidate sites as a single GPU-rendered circle layer.
 * One layer keeps panning smooth — the equivalent count of DOM markers would
 * stutter badly on a laptop.
 */
export function SiteDotsLayer({
  data,
  theme,
  dimmed,
}: {
  data: FeatureCollection<Point, SitePointProperties> | null;
  theme: Theme;
  dimmed: boolean;
}) {
  const layers = useMemo(
    () => [
      {
        id: "site-dots",
        type: "circle" as const,
        paint: {
          "circle-color": classColorExpression(theme),
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            1.4,
            12,
            2.4,
            14,
            3.8,
            16,
            6.5,
            18,
            10,
          ] as MapLibreGL.ExpressionSpecification,
          "circle-opacity": dimmed ? 0.28 : 0.78,
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0,
            15,
            0.8,
          ] as MapLibreGL.ExpressionSpecification,
          "circle-stroke-color": theme === "dark" ? "#0b1120" : "#ffffff",
          "circle-stroke-opacity": dimmed ? 0.2 : 0.6,
        },
      },
    ],
    [theme, dimmed],
  );

  useMapSource("site-dots-source", data, layers);
  return null;
}

/**
 * Central click/hover routing. A single map-level handler decides whether a
 * click landed on a selectable site dot or on open map, rather than relying on
 * the relative ordering of MapLibre's layer-filtered and map-level listeners.
 *
 * `pickLayers` is deliberately narrow. The background dot layer covers most of
 * the district, so if it intercepted clicks the user could never place a search
 * centre or evaluate a point — only the emphasised result dots opt in.
 */
export function MapInteractions({
  pickLayers,
  onSelectSite,
  onPickLocation,
}: {
  pickLayers: readonly string[];
  onSelectSite: (siteId: string) => void;
  onPickLocation: (lat: number, lon: number) => void;
}) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    const presentLayers = () => pickLayers.filter((id) => map.getLayer(id));

    const handleClick = (e: MapLibreGL.MapMouseEvent) => {
      const layers = presentLayers();
      const hits = layers.length
        ? map.queryRenderedFeatures(e.point, { layers })
        : [];
      const siteId = hits[0]?.properties?.site_id;

      if (typeof siteId === "string") {
        onSelectSite(siteId);
      } else {
        onPickLocation(e.lngLat.lat, e.lngLat.lng);
      }
    };

    const handleMove = (e: MapLibreGL.MapMouseEvent) => {
      const layers = presentLayers();
      const hits = layers.length
        ? map.queryRenderedFeatures(e.point, { layers })
        : [];
      map.getCanvas().style.cursor = hits.length ? "pointer" : "crosshair";
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMove);
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMove);
      if (map.getCanvas()) map.getCanvas().style.cursor = "";
    };
  }, [map, isLoaded, pickLayers, onSelectSite, onPickLocation]);

  return null;
}

/** Emphasised dots for the sites inside the current search radius. */
export function ResultDotsLayer({
  data,
  theme,
}: {
  data: FeatureCollection<Point, SitePointProperties> | null;
  theme: Theme;
}) {
  const layers = useMemo(
    () => [
      {
        id: "result-dots",
        type: "circle" as const,
        paint: {
          "circle-color": classColorExpression(theme),
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            3,
            14,
            5.5,
            16,
            8.5,
            18,
            12,
          ] as MapLibreGL.ExpressionSpecification,
          "circle-opacity": 0.92,
          "circle-stroke-width": 1.4,
          "circle-stroke-color": theme === "dark" ? "#0b1120" : "#ffffff",
        },
      },
    ],
    [theme],
  );

  useMapSource("result-dots-source", data, layers);
  return null;
}

/* ================================================================== */
/*  Search radius                                                      */
/* ================================================================== */

function geodesicCircle(
  lat: number,
  lon: number,
  radiusM: number,
  steps = 96,
): Feature<Polygon> {
  const ring: [number, number][] = [];
  const dLat = radiusM / 110574;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function SearchRadiusLayer({
  centre,
  radiusM,
  theme,
}: {
  centre: { lat: number; lon: number } | null;
  radiusM: number;
  theme: Theme;
}) {
  const data = useMemo<FeatureCollection | null>(() => {
    if (!centre || !Number.isFinite(radiusM) || radiusM <= 0) return null;
    return {
      type: "FeatureCollection",
      features: [geodesicCircle(centre.lat, centre.lon, radiusM)],
    };
  }, [centre, radiusM]);

  const layers = useMemo(() => {
    const tint = theme === "dark" ? "#8b9cf5" : "#4c5fd7";
    return [
      {
        id: "search-radius-fill",
        type: "fill" as const,
        paint: { "fill-color": tint, "fill-opacity": 0.1 },
      },
      {
        id: "search-radius-line",
        type: "line" as const,
        paint: {
          "line-color": tint,
          "line-width": 1.8,
          "line-opacity": 0.85,
          "line-dasharray": [2, 1.5],
        },
      },
    ];
  }, [theme]);

  useMapSource("search-radius", data, layers);
  return null;
}
