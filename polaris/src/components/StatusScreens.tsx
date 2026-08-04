import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shown while the dataset is being read — once per session. */
export function Splash() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="text-primary size-7 animate-spin" />
        <p className="text-sm font-semibold">Loading POLARIS</p>
        <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
          Reading the scored sites and the district map. This happens once per
          session.
        </p>
      </div>
    </div>
  );
}

/** Shown when the dataset could not be read at all — the app cannot proceed. */
export function FatalError({
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
