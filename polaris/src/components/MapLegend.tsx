import { useState } from "react";
import { ChevronDown, Layers, Waves } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CLASS_COLOR_VAR,
  classRange,
  DEFAULT_THRESHOLDS,
  SUITABILITY_CLASSES,
  type Thresholds,
} from "@/lib/suitability";

/**
 * Floating map key. Collapsible and bottom-left so it never collides with the
 * zoom controls (top-right) or the MapLibre attribution (bottom-right).
 */
export function MapLegend({
  thresholds = DEFAULT_THRESHOLDS,
  shorelineBufferM,
  showShorelineBuffer,
  onToggleShorelineBuffer,
  showAllSites,
  onToggleAllSites,
  siteCount,
  excludedCount,
}: {
  thresholds?: Thresholds;
  shorelineBufferM: number;
  showShorelineBuffer: boolean;
  onToggleShorelineBuffer: () => void;
  showAllSites: boolean;
  onToggleAllSites: () => void;
  siteCount: number;
  excludedCount: number;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[min(17rem,calc(100%-1.5rem))]">
      <div className="bg-card/90 pointer-events-auto overflow-hidden rounded-xl border shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="hover:bg-accent/60 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
        >
          <Layers className="text-primary size-3.5 shrink-0" />
          <span className="flex-1 text-xs font-semibold">Map key</span>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-3.5 shrink-0 transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
        </button>

        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-2.5 border-t px-3 py-2.5">
              <div>
                <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-widest uppercase">
                  Composite score
                </p>
                <ul className="space-y-1">
                  {SUITABILITY_CLASSES.map((cls) => (
                    <li
                      key={cls}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: `var(${CLASS_COLOR_VAR[cls]})`,
                          }}
                        />
                        <span className="truncate">{cls}</span>
                      </span>
                      <span className="text-muted-foreground tabular shrink-0">
                        {classRange(cls, thresholds)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-1.5 text-[11px]">
                    <span className="bg-suit-excluded size-2 shrink-0 rounded-full" />
                    <span className="text-muted-foreground truncate">
                      Excluded by shoreline setback
                    </span>
                  </li>
                </ul>
              </div>

              <p className="text-muted-foreground border-t pt-2 text-[10px] leading-relaxed">
                Closer to 1 = more suitable. Hazard penalties are already inside
                every score.
              </p>

              <div className="space-y-1.5 border-t pt-2">
                <LegendToggle
                  checked={showAllSites}
                  onChange={onToggleAllSites}
                  label={`All ${siteCount.toLocaleString()} scored sites`}
                />
                <LegendToggle
                  checked={showShorelineBuffer}
                  onChange={onToggleShorelineBuffer}
                  label={`${shorelineBufferM} m shoreline buffer`}
                  hint={`${excludedCount} site${excludedCount === 1 ? "" : "s"} excluded`}
                  icon={<Waves className="size-3" />}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendToggle({
  checked,
  onChange,
  label,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-primary size-3 cursor-pointer"
      />
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <span className="text-muted-foreground shrink-0 text-[10px]">{hint}</span>
      )}
    </label>
  );
}
