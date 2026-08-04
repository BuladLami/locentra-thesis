import { useEffect, useRef } from "react";
import type MapLibreGL from "maplibre-gl";
import type { GeoJSON } from "geojson";

import { useMap } from "@/components/ui/map";

/** `Omit` that distributes across a union, preserving per-layer paint typing. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * A layer definition without `source` — this hook supplies the source id, so
 * callers must not (and cannot) set it.
 */
export type LayerSpec = DistributiveOmit<MapLibreGL.LayerSpecification, "source">;

/**
 * Declaratively attaches one GeoJSON source plus its layers to the map that
 * mapcn's <Map> provides through context, and keeps the data in sync.
 *
 * mapcn ships <MapGeoJSON> for polygon fill/outline work, but the suitability
 * dots and the shoreline band need circle and width-scaled line layers, which
 * that component does not express. This hook is the supported extension path:
 * it composes on `useMap()` rather than reaching around it.
 */
export function useMapSource(
  sourceId: string,
  data: GeoJSON | null,
  layers: LayerSpec[],
) {
  const { map, isLoaded } = useMap();
  const layersRef = useRef<LayerSpec[]>(layers);
  layersRef.current = layers;

  // Create source + layers once the style is ready; tear them down on unmount
  // or when the map/style is swapped (e.g. a light/dark theme change).
  useEffect(() => {
    if (!map || !isLoaded || !data) return;

    let cancelled = false;

    // NOTE: do not gate this on `map.isStyleLoaded()`. That returns false
    // while the basemap's own tiles are still streaming, and no further
    // `styledata` event follows a tile load — so gating on it silently drops
    // the layer on first paint and it only appears if the caller toggles the
    // data off and on again. Adding a source only needs the style *spec*
    // parsed, which mapcn's `isLoaded` (the map's `load` event) already
    // guarantees. Anything genuinely premature throws and is retried below.
    const attach = () => {
      if (cancelled) return;

      // Idempotent: `idle` fires after every pan and zoom settle, so once the
      // source and its layers are present this must cost nothing. Without this
      // guard every settle would re-`setData` the whole feature collection.
      const hasSource = Boolean(map.getSource(sourceId));
      const hasLayers = layersRef.current.every((l) => map.getLayer(l.id));
      if (hasSource && hasLayers) return;

      try {
        if (!hasSource) {
          map.addSource(sourceId, { type: "geojson", data });
        } else {
          (map.getSource(sourceId) as MapLibreGL.GeoJSONSource).setData(data);
        }

        for (const layer of layersRef.current) {
          if (!map.getLayer(layer.id)) {
            map.addLayer({
              ...layer,
              source: sourceId,
            } as MapLibreGL.AddLayerObject);
          }
        }
      } catch {
        // Style not ready yet (mid-swap). One of the retries below will land.
      }
    };

    attach();
    // `style.load` covers theme swaps, which wipe every custom source and
    // layer. `idle` is the safety net: it fires once the map has finished
    // everything it was doing, so a first-paint miss cannot persist.
    map.on("style.load", attach);
    map.on("styledata", attach);
    map.on("idle", attach);

    return () => {
      cancelled = true;
      map.off("style.load", attach);
      map.off("styledata", attach);
      map.off("idle", attach);

      try {
        for (const layer of layersRef.current) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        }
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // The map was torn down before we got here; nothing left to clean up.
      }
    };
    // `data` updates are handled by the effect below so re-attaching is not
    // needed on every data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, sourceId, !!data]);

  // Push data updates without recreating the source.
  useEffect(() => {
    if (!map || !isLoaded || !data) return;
    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource | undefined;
    source?.setData(data);
  }, [map, isLoaded, sourceId, data]);

  // Push paint/layout updates without recreating the layers.
  useEffect(() => {
    if (!map || !isLoaded) return;
    for (const layer of layers) {
      if (!map.getLayer(layer.id)) continue;
      const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
      for (const [prop, value] of Object.entries(paint)) {
        map.setPaintProperty(layer.id, prop, value as never);
      }
      const layout = (layer as { layout?: Record<string, unknown> }).layout ?? {};
      for (const [prop, value] of Object.entries(layout)) {
        map.setLayoutProperty(layer.id, prop, value as never);
      }
    }
  }, [map, isLoaded, layers]);
}

/**
 * Pixel width of a fixed ground distance, as a MapLibre zoom expression.
 *
 * Web Mercator resolution is `156543.03 * cos(lat) / 2^zoom` metres per pixel,
 * so pixel width is proportional to `2^zoom`. An exponential-base-2
 * interpolation reproduces that exactly rather than approximating it, which is
 * what lets the 50 m shoreline buffer stay a true 50 m at every zoom level.
 */
export function metresToPixelsExpression(
  metres: number,
  latitude: number,
): MapLibreGL.ExpressionSpecification {
  // metresPerPixel = 156543.03392 * cos(lat) / 2^zoom, so
  // pixels = metres * 2^zoom / (156543.03392 * cos(lat)).
  const perZoomUnit =
    metres / (156543.03392 * Math.cos((latitude * Math.PI) / 180));

  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    8,
    perZoomUnit * 2 ** 8,
    22,
    perZoomUnit * 2 ** 22,
  ] as MapLibreGL.ExpressionSpecification;
}
