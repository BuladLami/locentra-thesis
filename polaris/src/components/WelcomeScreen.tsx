import { useState } from "react";
import { ArrowRight, Compass, Crosshair, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScoreGuideBody } from "@/components/ScoreGuideDialog";
import { cn } from "@/lib/utils";
import { DEFAULT_THRESHOLDS } from "@/lib/suitability";
import type { AppMode, DatasetMetadata } from "@/types/polaris";

const MODE_CARDS: {
  id: AppMode;
  title: string;
  description: string;
  icon: typeof Compass;
}[] = [
  {
    id: "recommendation",
    title: "Recommend sites",
    description:
      "Pick a search area and get the three best sites inside it, each with a written explanation of why.",
    icon: Compass,
  },
  {
    id: "evaluation",
    title: "Evaluate a location",
    description:
      "Click any point in the district and read its suitability score and what makes it good or bad.",
    icon: Crosshair,
  },
];

export function WelcomeScreen({
  metadata,
  siteCount,
  onEnter,
}: {
  metadata: DatasetMetadata | null;
  siteCount: number;
  onEnter: (mode: AppMode) => void;
}) {
  const [selected, setSelected] = useState<AppMode | null>(null);
  const thresholds = metadata?.thresholds ?? DEFAULT_THRESHOLDS;

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-8 px-5 py-10 sm:py-14">
        {/* Masthead */}
        <header className="animate-rise-in space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <MapPin className="size-3" />
              {metadata?.study_area ?? "Talomo District, Davao City"}
            </Badge>
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            POLARIS
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
            A map-based tool for deciding where to put a new health facility. It
            has already scored{" "}
            <strong className="text-foreground">
              {siteCount.toLocaleString()}
            </strong>{" "}
            possible sites across the district from 0 to 1, so you can see at a
            glance which ones are worth considering.
          </p>
        </header>

        {/* Panel revision #5 — the guide comes BEFORE any number is shown. */}
        <section
          className="animate-rise-in space-y-3"
          style={{ animationDelay: "60ms", animationFillMode: "backwards" }}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Read this first: what the scores mean
            </h2>
            <p className="text-muted-foreground text-sm">
              Four things worth knowing before you look at any site.
            </p>
          </div>
          <ScoreGuideBody thresholds={thresholds} compact />
        </section>

        {/* Mode choice */}
        <section
          className="animate-rise-in space-y-3"
          style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
        >
          <h2 className="text-lg font-semibold tracking-tight">
            What would you like to do?
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {MODE_CARDS.map(({ id, title, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                aria-pressed={selected === id}
                className={cn(
                  "group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all duration-200",
                  "hover:-translate-y-0.5 hover:shadow-md",
                  "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                  selected === id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "bg-card hover:border-primary/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-lg transition-colors",
                    selected === id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="size-4.5" />
                </span>
                <span className="font-semibold">{title}</span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {description}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="lg"
              disabled={!selected}
              onClick={() => selected && onEnter(selected)}
            >
              Open the map
              <ArrowRight className="size-4" />
            </Button>
            {!selected && (
              <p className="text-muted-foreground text-xs">
                Choose one of the two options above to continue.
              </p>
            )}
          </div>
        </section>

        <footer className="text-muted-foreground border-t pt-5 text-xs leading-relaxed">
          <p>
            {metadata?.advisory_note ??
              "POLARIS is only a guide. The final decision on where to build a health facility still rests with the planning officers."}
          </p>
          <p className="mt-1">
            University of the Immaculate Conception — College of Computer
            Studies, Davao City.
          </p>
        </footer>
      </div>
    </ScrollArea>
  );
}
