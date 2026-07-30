import { Database, MapPinned, TreePine, Waves } from "lucide-react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { HAZARD_LABEL, SERVICE_FACTOR_LABEL } from "@/lib/suitability";
import type { DatasetMetadata, HazardKey, ServiceFactorKey } from "@/types/polaris";

/**
 * Panel revision #6 — states plainly that the ~300,000 OpenStreetMap figure
 * and the ~3,000 training-site figure describe two different quantities, and
 * shows the exact counts this dataset carries.
 */
export function DatasetInfoDialog({
  open,
  onOpenChange,
  metadata,
  siteCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: DatasetMetadata | null;
  siteCount: number;
}) {
  if (!metadata) return null;

  const clarification = metadata.dataset_clarification;
  const rawRecords = clarification?.raw_osm_records_extracted ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Model and dataset</DialogTitle>
          <DialogDescription>
            {metadata.study_area} — what was extracted, what was scored, and how
            the score is built.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* ---- Revision #6: the two counts are different things ---- */}
          <section className="space-y-3">
            <SectionTitle icon={<Database className="size-4" />}>
              Dataset size — two different quantities
            </SectionTitle>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Raw OpenStreetMap records extracted"
                value={
                  rawRecords !== null
                    ? rawRecords.toLocaleString()
                    : "≈300,000"
                }
                caveat={
                  rawRecords !== null
                    ? "Building footprints + road nodes + road edges + facilities"
                    : "Manuscript figure. The revised training pipeline prints the exact count at run time; this migrated dataset does not carry it."
                }
              />
              <StatCard
                label="Candidate sites entering the model"
                value={clarification.training_candidate_sites.toLocaleString()}
                caveat={`Grid points scored inside the district boundary. ${siteCount.toLocaleString()} are loaded in this session.`}
                emphasis
              />
            </div>

            <p className="text-muted-foreground bg-muted/50 rounded-lg border p-3 text-xs leading-relaxed">
              {clarification.note}
            </p>
          </section>

          <Separator />

          {/* ---- Revision #1 + #8: single Random Forest, hazard intrinsic ---- */}
          <section className="space-y-3">
            <SectionTitle icon={<TreePine className="size-4" />}>
              Model
            </SectionTitle>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {metadata.model}
              </Badge>
              {metadata.model_status === "provisional" && (
                <Badge variant="outline" className="text-suit-low text-xs">
                  Provisional dataset
                </Badge>
              )}
            </div>

            {metadata.model_note && (
              <p className="border-suit-low/50 bg-suit-low/5 rounded-lg border-l-2 p-3 text-xs leading-relaxed">
                {metadata.model_note}
              </p>
            )}

            <p className="text-muted-foreground text-xs leading-relaxed">
              There is exactly one model configuration. The pre-defense
              &ldquo;with hazard / without hazard&rdquo; pair was removed: a
              hazardous site should not be recommended at all, so hazard is an
              intrinsic, non-optional penalty inside every score rather than a
              toggle that could be switched off to obtain a flattering number.
            </p>
          </section>

          <Separator />

          {/* ---- Weights ---- */}
          <section className="space-y-3">
            <SectionTitle icon={<MapPinned className="size-4" />}>
              Composite score weighting
            </SectionTitle>

            <div className="grid gap-4 sm:grid-cols-2">
              <WeightList
                heading="Service factors (added)"
                total={0.8}
                entries={Object.entries(metadata.weights.service).map(
                  ([key, value]) => ({
                    label: SERVICE_FACTOR_LABEL[key as ServiceFactorKey] ?? key,
                    value,
                  }),
                )}
              />
              <WeightList
                heading="Hazard penalties (subtracted)"
                total={0.2}
                entries={Object.entries(metadata.weights.hazard_penalty).map(
                  ([key, value]) => ({
                    label: HAZARD_LABEL[key as HazardKey] ?? key,
                    value,
                  }),
                )}
                negative
              />
            </div>
          </section>

          <Separator />

          {/* ---- Revision #2: shoreline buffer ---- */}
          <section className="space-y-2">
            <SectionTitle icon={<Waves className="size-4" />}>
              Hard constraints
            </SectionTitle>
            <ul className="text-muted-foreground space-y-1.5 text-xs leading-relaxed">
              <li>
                <strong className="text-foreground">
                  {metadata.shoreline_buffer_m} m shoreline setback.
                </strong>{" "}
                Distance to the OpenStreetMap coastline is measured for every
                site. {clarification.shoreline_excluded_sites.toLocaleString()}{" "}
                site
                {clarification.shoreline_excluded_sites === 1 ? "" : "s"} fall
                inside the buffer and can never be recommended. Toggle the band
                on the map to see it.
              </li>
              <li>
                <strong className="text-foreground">Hazard eligibility gate.</strong>{" "}
                Any site rated High on flood, landslide or storm surge
                susceptibility is excluded from the recommendation list
                regardless of its numeric score.
              </li>
              <li>
                <strong className="text-foreground">
                  Top {metadata.top_n_recommendations} only.
                </strong>{" "}
                The recommendation list is capped so a non-technical reviewer is
                not handed thousands of near-identical options.
              </li>
            </ul>
          </section>

          {metadata.generated_at && (
            <p className="text-muted-foreground text-[11px]">
              Dataset generated {new Date(metadata.generated_at).toLocaleString()}
              {metadata.generated_by ? ` by ${metadata.generated_by}` : ""}.
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function SectionTitle({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="text-primary">{icon}</span>
      {children}
    </h3>
  );
}

function StatCard({
  label,
  value,
  caveat,
  emphasis,
}: {
  label: string;
  value: string;
  caveat: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "border-primary/40 bg-primary/5 rounded-lg border p-3"
          : "bg-muted/40 rounded-lg border p-3"
      }
    >
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
        {caveat}
      </p>
    </div>
  );
}

function WeightList({
  heading,
  entries,
  total,
  negative,
}: {
  heading: string;
  entries: { label: string; value: number }[];
  total: number;
  negative?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-semibold">
        {heading} — {negative ? "−" : ""}
        {total.toFixed(2)} total
      </p>
      <ul className="space-y-1.5">
        {entries.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="tabular font-semibold">
              {negative ? "−" : "+"}
              {entry.value.toFixed(3)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
