import { useCallback, useEffect, useState } from "react";

import { loadBundle, reloadBundle, type PolarisBundle } from "@/lib/dataset";

export interface PolarisData {
  bundle: PolarisBundle | null;
  loadError: string | null;
  refreshing: boolean;
  /** The only path that re-reads the dataset. Explicitly user-initiated. */
  refresh: () => void;
}

/**
 * Owns the load-once dataset lifecycle.
 *
 * The scored dataset never changes on its own, so it is fetched exactly once
 * per session and memoised in `lib/dataset`. Nothing here polls or revalidates
 * — `refresh()` is wired to the header button and is the sole way to re-read.
 */
export function usePolarisData(): PolarisData {
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

  const refresh = useCallback(() => {
    setRefreshing(true);
    setLoadError(null);
    reloadBundle()
      .then(setBundle)
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  return { bundle, loadError, refreshing, refresh };
}
