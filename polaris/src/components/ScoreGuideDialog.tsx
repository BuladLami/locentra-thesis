import { Compass, Route, ShieldAlert, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SuitabilityBadge } from "@/components/ScoreDisplay";
import {
  classRange,
  DEFAULT_THRESHOLDS,
  SCORE_GUIDE_POINTS,
  SUITABILITY_CLASSES,
  type Thresholds,
} from "@/lib/suitability";
import type { DatasetMetadata } from "@/types/polaris";

const POINT_ICONS = [Compass, Route, ShieldAlert, Trophy];

/**
 * Panel revision #5 — the upfront, standalone explanation of how to read a
 * suitability score. Reachable at any time from the header, and shown on the
 * welcome screen before the user ever sees a number.
 */
export function ScoreGuideDialog({
  open,
  onOpenChange,
  metadata,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: DatasetMetadata | null;
}) {
  const thresholds = metadata?.thresholds ?? DEFAULT_THRESHOLDS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>How to read a suitability score</DialogTitle>
          <DialogDescription>
            Read this once and you will not need the methodology chapter to
            interpret any number in POLARIS.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <ScoreGuideBody thresholds={thresholds} />

          {metadata?.score_guide && (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Verbatim guide from the training pipeline
              </h3>
              <p className="text-muted-foreground bg-muted/50 rounded-lg border p-3 text-xs leading-relaxed">
                {metadata.score_guide}
              </p>
            </section>
          )}

          {metadata?.advisory_note && (
            <p className="border-primary/40 bg-primary/5 rounded-lg border-l-2 p-3 text-xs leading-relaxed">
              <strong>Advisory use.</strong> {metadata.advisory_note}
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** The guide itself, reused inline on the welcome screen. */
export function ScoreGuideBody({
  thresholds = DEFAULT_THRESHOLDS,
  compact = false,
}: {
  thresholds?: Thresholds;
  compact?: boolean;
}) {
  return (
    <div className="space-y-5">
      <ul className="grid gap-3 sm:grid-cols-2">
        {SCORE_GUIDE_POINTS.map((point, i) => {
          const Icon = POINT_ICONS[i] ?? Compass;
          return (
            <li
              key={point.title}
              className="bg-muted/40 flex gap-3 rounded-lg border p-3"
            >
              <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-md">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm leading-snug font-semibold">{point.title}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {point.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {!compact && (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Classification thresholds
          </h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="px-3 py-2 font-semibold">Class</th>
                  <th className="px-3 py-2 font-semibold">Composite score</th>
                  <th className="px-3 py-2 font-semibold">What it means</th>
                </tr>
              </thead>
              <tbody>
                {SUITABILITY_CLASSES.map((cls) => (
                  <tr key={cls} className="border-t">
                    <td className="px-3 py-2">
                      <SuitabilityBadge suitabilityClass={cls} />
                    </td>
                    <td className="tabular px-3 py-2 text-xs whitespace-nowrap">
                      {classRange(cls, thresholds)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs">
                      {CLASS_MEANING[cls]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Callout title="Reading a value like 0.007">
        Individual factor values run in the same direction as the composite
        score. Road accessibility is a normalized <em>inverse</em> distance to
        the road network, so a value near <strong>0</strong> means the site is
        among the <strong>farthest</strong> from mapped roads and therefore has{" "}
        <strong>low</strong> accessibility. A value near <strong>1</strong>{" "}
        means the site sits on or beside the network. A score of 0.007 is a
        warning sign, not a rounding artefact.
      </Callout>
    </div>
  );
}

const CLASS_MEANING: Record<string, string> = {
  "Highly Suitable":
    "Strong candidate — serves a dense population, is well connected, fills a coverage gap and carries little hazard penalty.",
  "Moderately Suitable":
    "Workable, but at least one factor is compromised. Compare against the sites above it before committing.",
  "Low Suitability":
    "Weak on several factors or meaningfully penalised by hazard. Site only if constrained to this area.",
  "Not Suitable":
    "Fails on the dominant factors and/or carries a heavy hazard penalty.",
};

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-primary/40 bg-primary/5 rounded-lg border-l-2 p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {children}
      </p>
    </div>
  );
}
