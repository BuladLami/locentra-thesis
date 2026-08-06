import { useCallback, useMemo } from "react";
import type { FeatureCollection } from "geojson";
import { Crosshair, MapPin } from "lucide-react";

import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
  type MapRef,
} from "@/components/ui/map";
import {
  BoundaryLayer,
  FacilitiesLayer,
  FacilityHover,
  MapInteractions,
  ResultDotsLayer,
  SearchRadiusLayer,
  ShorelineBufferLayer,
  SiteDotsLayer,
  sitesToFeatureCollection,
} from "@/components/map/layers";
import type { Theme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { formatScore } from "@/lib/suitability";
import type { AppMode, RankedSite, Site, TopRecommendation } from "@/types/polaris";

/** Opening view of the district — also where "Clear search" returns to. */
export const TALOMO_CENTRE: [number, number] = [125.5439, 7.0511];
export const DEFAULT_ZOOM = 12.2;

export interface SuitabilityMapProps {
  mapRef: React.Ref<MapRef>;
  theme: Theme;
  mode: AppMode;
  sites: readonly Site[];
  resultSites: readonly RankedSite[];
  topRecommendations: readonly TopRecommendation[];
  boundary: FeatureCollection | null;
  coastline: FeatureCollection | null;
  facilities: FeatureCollection | null;
  shorelineBufferM: number;
  showShorelineBuffer: boolean;
  showAllSites: boolean;
  showFacilities: boolean;
  searchCentre: { lat: number; lon: number } | null;
  searchRadiusM: number;
  evalPoint: { lat: number; lon: number } | null;
  onSelectSite: (siteId: string) => void;
  onPickLocation: (lat: number, lon: number) => void;
  className?: string;
}

export function SuitabilityMap({
  mapRef,
  theme,
  mode,
  sites,
  resultSites,
  topRecommendations,
  boundary,
  coastline,
  facilities,
  shorelineBufferM,
  showShorelineBuffer,
  showAllSites,
  showFacilities,
  searchCentre,
  searchRadiusM,
  evalPoint,
  onSelectSite,
  onPickLocation,
  className,
}: SuitabilityMapProps) {
  const allSitesGeoJson = useMemo(
    () => (showAllSites ? sitesToFeatureCollection(sites, shorelineBufferM) : null),
    [sites, shorelineBufferM, showAllSites],
  );

  const resultGeoJson = useMemo(
    () =>
      resultSites.length
        ? sitesToFeatureCollection(resultSites, shorelineBufferM)
        : null,
    [resultSites, shorelineBufferM],
  );

  const handleSelect = useCallback(
    (siteId: string) => onSelectSite(siteId),
    [onSelectSite],
  );

  /**
   * Only the emphasised result dots open a site dialog on click. The
   * district-wide dot layer stays click-through so that placing a search centre
   * — and, in evaluation mode, clicking any point at all — always works.
   */
  const pickLayers = useMemo(
    () => (mode === "recommendation" ? ["result-dots"] : []),
    [mode],
  );

  return (
    <Map
      ref={mapRef}
      theme={theme}
      className={cn("size-full", className)}
      center={TALOMO_CENTRE}
      zoom={DEFAULT_ZOOM}
      minZoom={9}
      maxZoom={18}
      attributionControl={{ compact: true }}
    >
      <MapInteractions
        pickLayers={pickLayers}
        onSelectSite={handleSelect}
        onPickLocation={onPickLocation}
      />

      {/* Draw order is mount order: context first, then the data on top. */}
      <BoundaryLayer data={boundary} theme={theme} />
      <SearchRadiusLayer
        centre={mode === "recommendation" ? searchCentre : null}
        radiusM={searchRadiusM}
        theme={theme}
      />
      <ShorelineBufferLayer
        data={coastline}
        bufferM={shorelineBufferM}
        theme={theme}
        visible={showShorelineBuffer}
      />
      <SiteDotsLayer
        data={allSitesGeoJson}
        theme={theme}
        dimmed={resultSites.length > 0}
      />
      {/* Above the district-wide dot cloud so it stays readable over it, but
          below the numbered recommendations, which must never be obscured. */}
      <FacilitiesLayer
        data={facilities}
        theme={theme}
        visible={showFacilities}
      />
      <FacilityHover enabled={showFacilities} />
      <ResultDotsLayer data={resultGeoJson} theme={theme} />

      {/* Search centre */}
      {mode === "recommendation" && searchCentre && (
        <MapMarker longitude={searchCentre.lon} latitude={searchCentre.lat}>
          <MarkerContent>
            <div className="relative grid place-items-center">
              <span className="bg-primary/40 absolute size-6 rounded-full animate-pulse-ring" />
              <span className="border-background bg-primary grid size-6 place-items-center rounded-full border-2 shadow-lg">
                <Crosshair className="text-primary-foreground size-3.5" />
              </span>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="bg-popover text-popover-foreground rounded-lg border px-2.5 py-1.5 text-xs shadow-lg">
              <p className="font-semibold">Search centre</p>
              <p className="text-muted-foreground tabular">
                {searchCentre.lat.toFixed(5)}, {searchCentre.lon.toFixed(5)}
              </p>
            </div>
          </MarkerTooltip>
        </MapMarker>
      )}

      {/* Evaluation point */}
      {mode === "evaluation" && evalPoint && (
        <MapMarker longitude={evalPoint.lon} latitude={evalPoint.lat}>
          <MarkerContent>
            <div className="relative grid place-items-center">
              <span className="bg-primary/40 absolute size-7 rounded-full animate-pulse-ring" />
              <MapPin className="fill-primary text-primary-foreground size-7 drop-shadow-lg" />
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="bg-popover text-popover-foreground rounded-lg border px-2.5 py-1.5 text-xs shadow-lg">
              <p className="font-semibold">Evaluated location</p>
              <p className="text-muted-foreground tabular">
                {evalPoint.lat.toFixed(5)}, {evalPoint.lon.toFixed(5)}
              </p>
            </div>
          </MarkerTooltip>
        </MapMarker>
      )}

      {/* Top-N recommended sites (panel revision #4) */}
      {topRecommendations.map((rec) => (
        <MapMarker
          key={rec.site_id}
          longitude={rec.longitude}
          latitude={rec.latitude}
          onClick={() => handleSelect(rec.site_id)}
        >
          <MarkerContent>
            <div className="group relative grid cursor-pointer place-items-center">
              <span className="bg-suit-high/35 absolute size-8 rounded-full animate-pulse-ring" />
              <span className="border-background bg-suit-high grid size-8 place-items-center rounded-full border-[2.5px] text-sm font-bold text-white shadow-xl transition-transform duration-200 group-hover:scale-110">
                {rec.recommendation_rank}
              </span>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="bg-popover text-popover-foreground max-w-56 rounded-lg border px-3 py-2 shadow-xl">
              <p className="text-suit-high text-[10px] font-bold tracking-widest uppercase">
                Recommendation #{rec.recommendation_rank}
              </p>
              <p className="mt-0.5 text-sm font-semibold">{rec.site_id}</p>
              {rec.barangay && (
                <p className="text-muted-foreground text-xs">{rec.barangay}</p>
              )}
              <p className="mt-1 text-xs">
                Score{" "}
                <span className="tabular font-semibold">
                  {formatScore(rec.score)}
                </span>{" "}
                <span className="text-muted-foreground">
                  ({rec.suitability_class})
                </span>
              </p>
            </div>
          </MarkerTooltip>
        </MapMarker>
      ))}

      <MapControls position="top-right" showZoom showCompass showFullscreen />
    </Map>
  );
}
