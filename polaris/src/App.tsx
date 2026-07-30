import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { DatasetInfoDialog } from "@/components/DatasetInfoDialog";
import { EvaluationPanel } from "@/components/EvaluationPanel";
import { MapLegend } from "@/components/MapLegend";
import {
  RecommendationsPanel,
  type RecommendationSummary,
} from "@/components/RecommendationsPanel";
import { ScoreGuideDialog } from "@/components/ScoreGuideDialog";
import { SearchPanel } from "@/components/SearchPanel";
import { SiteDetailsDialog } from "@/components/SiteDetailsDialog";
import { SuitabilityMap } from "@/components/SuitabilityMap";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MapRef } from "@/components/ui/map";
import { useTheme } from "@/hooks/use-theme";
import {
  loadBundle,
  reloadBundle,
  type PolarisBundle,
} from "@/lib/dataset";
import {
  boundsOfSites,
  findNearestSite,
  isInsideBounds,
  sitesWithinRadius,
} from "@/lib/geo";
import { isShorelineExcluded } from "@/lib/suitability";
import type {
  AppMode,
  EvaluationResult,
  RankedSite,
  Site,
  TopRecommendation,
} from "@/types/polaris";

const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 5000;
const DEFAULT_RADIUS_M = "750";
/** A click farther than this from any scored site is off-grid (sea / outside). */
const OFF_GRID_M = 1000;

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);

  /* ---- Load-once data ------------------------------------------------ */
  const [bundle, setBundle] = useState<PolarisBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBundle()
      .then((b) => alive && setBundle(b))
      .catch((err: Error) => alive && setLoadError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  /** The only path that re-reads the dataset. Explicitly user-initiated. */
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLoadError(null);
    reloadBundle()
      .then(setBundle)
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  /* ---- Shell state --------------------------------------------------- */
  const [showWelcome, setShowWelcome] = useState(true);
  const [mode, setMode] = useState<AppMode>("recommendation");
  const [scoreGuideOpen, setScoreGuideOpen] = useState(false);
  const [datasetInfoOpen, setDatasetInfoOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showShorelineBuffer, setShowShorelineBuffer] = useState(true);
  const [showAllSites, setShowAllSites] = useState(true);

  /* ---- Recommendation state (kept independent of evaluation) --------- */
  const [searchLat, setSearchLat] = useState("");
  const [searchLon, setSearchLon] = useState("");
  const [searchRadius, setSearchRadius] = useState(DEFAULT_RADIUS_M);
  const [results, setResults] = useState<RankedSite[]>([]);
  const [summary, setSummary] = useState<RecommendationSummary | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  /* ---- Evaluation state ---------------------------------------------- */
  const [evalLat, setEvalLat] = useState("");
  const [evalLon, setEvalLon] = useState("");
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  /* ---- Derived ------------------------------------------------------- */
  const metadata = bundle?.dataset.metadata ?? null;
  const sites = useMemo(() => bundle?.dataset.sites ?? [], [bundle]);
  const bufferM = metadata?.shoreline_buffer_m ?? 50;
  const topN = metadata?.top_n_recommendations ?? 3;

  const siteIndex = useMemo(
    () => new Map(sites.map((s) => [s.site_id, s])),
    [sites],
  );

  const bounds = useMemo(() => boundsOfSites(sites), [sites]);

  const excludedCount = useMemo(
    () => sites.filter((s) => isShorelineExcluded(s, bufferM)).length,
    [sites, bufferM],
  );

  const searchCentre = useMemo(() => {
    const lat = Number.parseFloat(searchLat);
    const lon = Number.parseFloat(searchLon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }, [searchLat, searchLon]);

  const evalPoint = useMemo(() => {
    const lat = Number.parseFloat(evalLat);
    const lon = Number.parseFloat(evalLon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }, [evalLat, evalLon]);

  /**
   * Markers on the map: the district-wide top three until a search narrows
   * things down, then the top three inside that search. Never more than N —
   * panel revision #4.
   */
  const mapRecommendations = useMemo<TopRecommendation[]>(() => {
    if (mode !== "recommendation") return [];
    if (results.length > 0) {
      return results.slice(0, topN).map((site, i) => ({
        recommendation_rank: i + 1,
        site_id: site.site_id,
        score: site.score,
        suitability_class: site.suitability_class,
        latitude: site.latitude,
        longitude: site.longitude,
        barangay: site.barangay,
        interpretation: site.interpretation,
      }));
    }
    return (bundle?.dataset.top_recommendations ?? []).slice(0, topN);
  }, [mode, results, topN, bundle]);

  const selectedSite: Site | null = selectedSiteId
    ? (siteIndex.get(selectedSiteId) ?? null)
    : null;

  const selectedRank = useMemo(() => {
    if (!selectedSiteId) return undefined;
    const hit = mapRecommendations.find((r) => r.site_id === selectedSiteId);
    return hit?.recommendation_rank;
  }, [selectedSiteId, mapRecommendations]);

  /* ---- Map helpers --------------------------------------------------- */
  const flyTo = useCallback((lat: number, lon: number, zoom = 15) => {
    mapRef.current?.flyTo({
      center: [lon, lat],
      zoom,
      duration: 900,
      essential: true,
    });
  }, []);

  const validatePoint = useCallback(
    (lat: number, lon: number): string | null => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return "Enter a valid latitude and longitude, or click the map.";
      }
      if (bounds && !isInsideBounds(lat, lon, bounds, 0.01)) {
        return "That point is outside Talomo District. Pick a location inside the mapped study area.";
      }
      const nearest = findNearestSite(sites, lat, lon);
      if (!nearest || nearest.distanceM > OFF_GRID_M) {
        return "No analysed site lies near that point — it is likely offshore or outside the candidate grid. Pick a location on land within the district.";
      }
      return null;
    },
    [bounds, sites],
  );

  /* ---- Recommendation run (the only place ranking happens) ----------- */
  const runRecommendation = useCallback(() => {
    const lat = Number.parseFloat(searchLat);
    const lon = Number.parseFloat(searchLon);
    const radius = Number.parseFloat(searchRadius);

    const pointError = validatePoint(lat, lon);
    if (pointError) {
      setSearchError(pointError);
      return;
    }
    if (
      !Number.isFinite(radius) ||
      radius < MIN_RADIUS_M ||
      radius > MAX_RADIUS_M
    ) {
      setSearchError(
        `Enter a search radius between ${MIN_RADIUS_M} and ${MAX_RADIUS_M.toLocaleString()} metres.`,
      );
      return;
    }

    const inRadius = sitesWithinRadius(sites, lat, lon, radius);

    const shorelineExcluded = inRadius.filter(({ site }) =>
      isShorelineExcluded(site, bufferM),
    ).length;
    const hazardExcluded = inRadius.filter(
      ({ site }) =>
        !site.recommendation_eligible && !isShorelineExcluded(site, bufferM),
    ).length;

    const ranked: RankedSite[] = inRadius
      .filter(({ site }) => site.recommendation_eligible)
      .sort((a, b) => b.site.score - a.site.score)
      .slice(0, topN)
      .map(({ site, distanceM }, i) => ({
        ...site,
        localRank: i + 1,
        distanceFromCentreM: distanceM,
      }));

    setSearchError(null);
    setResults(ranked);
    setSummary({
      inRadius: inRadius.length,
      shorelineExcluded,
      hazardExcluded,
    });

    if (ranked.length > 0) {
      flyTo(lat, lon, radius <= 400 ? 16 : radius <= 1200 ? 14.6 : 13.4);
    }
  }, [
    searchLat,
    searchLon,
    searchRadius,
    sites,
    bufferM,
    topN,
    validatePoint,
    flyTo,
  ]);

  const runEvaluation = useCallback(
    (lat: number, lon: number) => {
      const pointError = validatePoint(lat, lon);
      if (pointError) {
        setEvalError(pointError);
        setEvalResult(null);
        return;
      }

      const nearest = findNearestSite(sites, lat, lon);
      if (!nearest) {
        setEvalError("No analysed sites are loaded.");
        setEvalResult(null);
        return;
      }

      setEvalError(null);
      setEvalResult({
        latitude: lat,
        longitude: lon,
        site: nearest.site,
        distanceM: nearest.distanceM,
        outsideCoverage: nearest.distanceM > 250,
      });
    },
    [sites, validatePoint],
  );

  /* ---- Map interactions ---------------------------------------------- */
  const handlePickLocation = useCallback(
    (lat: number, lon: number) => {
      if (mode === "recommendation") {
        setSearchLat(lat.toFixed(6));
        setSearchLon(lon.toFixed(6));
        setSearchError(null);
        // Stale results must never outlive the query that produced them.
        setResults([]);
        setSummary(null);
      } else {
        setEvalLat(lat.toFixed(6));
        setEvalLon(lon.toFixed(6));
        runEvaluation(lat, lon);
      }
    },
    [mode, runEvaluation],
  );

  const handleSelectSite = useCallback((siteId: string) => {
    setSelectedSiteId(siteId);
  }, []);

  const handleClearPoint = useCallback(() => {
    if (mode === "recommendation") {
      setSearchLat("");
      setSearchLon("");
      setResults([]);
      setSummary(null);
      setSearchError(null);
    } else {
      setEvalLat("");
      setEvalLon("");
      setEvalResult(null);
      setEvalError(null);
    }
  }, [mode]);

  const handleExit = useCallback(() => {
    setShowWelcome(true);
    setSelectedSiteId(null);
  }, []);

  const handleRunFromPanel = useCallback(() => {
    if (mode === "recommendation") {
      runRecommendation();
    } else {
      runEvaluation(Number.parseFloat(evalLat), Number.parseFloat(evalLon));
    }
  }, [mode, runRecommendation, runEvaluation, evalLat, evalLon]);

  /* ---- Render -------------------------------------------------------- */

  if (loadError && !bundle) {
    return <FatalError message={loadError} onRetry={handleRefresh} />;
  }

  if (!bundle) {
    return <Splash />;
  }

  if (showWelcome) {
    return (
      <TooltipProvider>
        <div className="h-full">
          <WelcomeScreen
            metadata={metadata}
            siteCount={sites.length}
            onEnter={(m) => {
              setMode(m);
              setShowWelcome(false);
            }}
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      {/* Rows: header then content. The content row is the only scroll owner,
          so the map can never be pushed off-screen or overlap the header. */}
      <div className="grid h-full grid-rows-[auto_1fr] overflow-hidden">
        <AppHeader
          mode={mode}
          onModeChange={setMode}
          onOpenScoreGuide={() => setScoreGuideOpen(true)}
          onOpenDatasetInfo={() => setDatasetInfoOpen(true)}
          onRefresh={handleRefresh}
          onExit={handleExit}
          refreshing={refreshing}
          loadedAt={bundle.loadedAt}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="grid min-h-0 grid-rows-[minmax(16rem,45vh)_1fr] lg:grid-cols-[1fr_23rem] lg:grid-rows-1">
          {/* Map */}
          <div className="relative min-h-0 overflow-hidden border-b lg:order-1 lg:border-r lg:border-b-0">
            <SuitabilityMap
              mapRef={mapRef}
              theme={theme}
              mode={mode}
              sites={sites}
              resultSites={results}
              topRecommendations={mapRecommendations}
              boundary={bundle.boundary}
              coastline={bundle.coastline}
              shorelineBufferM={bufferM}
              showShorelineBuffer={showShorelineBuffer}
              showAllSites={showAllSites}
              searchCentre={searchCentre}
              searchRadiusM={Number.parseFloat(searchRadius) || 0}
              evalPoint={evalPoint}
              onSelectSite={handleSelectSite}
              onPickLocation={handlePickLocation}
            />

            <MapLegend
              thresholds={metadata?.thresholds}
              shorelineBufferM={bufferM}
              showShorelineBuffer={showShorelineBuffer}
              onToggleShorelineBuffer={() => setShowShorelineBuffer((v) => !v)}
              showAllSites={showAllSites}
              onToggleAllSites={() => setShowAllSites((v) => !v)}
              siteCount={sites.length}
              excludedCount={excludedCount}
            />
          </div>

          {/* Sidebar — its own scroll container, so panels never overlap the map */}
          <aside className="bg-card/40 flex min-h-0 flex-col lg:order-2">
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-5 p-4">
                <SearchPanel
                  mode={mode}
                  barangays={bundle.barangays}
                  latitude={mode === "recommendation" ? searchLat : evalLat}
                  longitude={mode === "recommendation" ? searchLon : evalLon}
                  radiusM={searchRadius}
                  minRadiusM={MIN_RADIUS_M}
                  maxRadiusM={MAX_RADIUS_M}
                  error={mode === "recommendation" ? searchError : evalError}
                  busy={false}
                  hasResults={results.length > 0}
                  onLatitudeChange={
                    mode === "recommendation" ? setSearchLat : setEvalLat
                  }
                  onLongitudeChange={
                    mode === "recommendation" ? setSearchLon : setEvalLon
                  }
                  onRadiusChange={setSearchRadius}
                  onRun={handleRunFromPanel}
                  onClear={handleClearPoint}
                  onFlyTo={flyTo}
                />

                <div className="border-t pt-4">
                  {mode === "recommendation" ? (
                    <RecommendationsPanel
                      results={results}
                      summary={summary}
                      topN={topN}
                      radiusM={Number.parseFloat(searchRadius) || 0}
                      onSelectSite={handleSelectSite}
                      onFocusSite={(site) =>
                        flyTo(site.latitude, site.longitude, 16.5)
                      }
                    />
                  ) : (
                    <EvaluationPanel
                      result={evalResult}
                      metadata={metadata}
                      onOpenDetails={handleSelectSite}
                    />
                  )}
                </div>
              </div>
            </ScrollArea>
          </aside>
        </main>
      </div>

      <ScoreGuideDialog
        open={scoreGuideOpen}
        onOpenChange={setScoreGuideOpen}
        metadata={metadata}
      />
      <DatasetInfoDialog
        open={datasetInfoOpen}
        onOpenChange={setDatasetInfoOpen}
        metadata={metadata}
        siteCount={sites.length}
      />
      <SiteDetailsDialog
        site={selectedSite}
        metadata={metadata}
        recommendationRank={selectedRank}
        onOpenChange={(open) => !open && setSelectedSiteId(null)}
      />
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */

function Splash() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="text-primary size-7 animate-spin" />
        <p className="text-sm font-semibold">Loading POLARIS</p>
        <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
          Reading the scored candidate sites and district geometry. This happens
          once per session.
        </p>
      </div>
    </div>
  );
}

function FatalError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="bg-destructive/10 text-destructive grid size-11 place-items-center rounded-full">
          <AlertTriangle className="size-5" />
        </span>
        <p className="text-sm font-semibold">Could not load the site data</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
      </div>
    </div>
  );
}
