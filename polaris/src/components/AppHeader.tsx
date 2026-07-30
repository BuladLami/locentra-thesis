import {
  Compass,
  Crosshair,
  Database,
  HelpCircle,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Theme } from "@/hooks/use-theme";
import type { AppMode } from "@/types/polaris";

export interface AppHeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenScoreGuide: () => void;
  onOpenDatasetInfo: () => void;
  onRefresh: () => void;
  onExit: () => void;
  refreshing: boolean;
  loadedAt: Date | null;
  theme: Theme;
  onToggleTheme: () => void;
}

const MODES: { id: AppMode; label: string; icon: typeof Compass; hint: string }[] =
  [
    {
      id: "recommendation",
      label: "Recommend",
      icon: Compass,
      hint: "Search an area and surface the top three eligible sites.",
    },
    {
      id: "evaluation",
      label: "Evaluate",
      icon: Crosshair,
      hint: "Read the composite score for one specific location.",
    },
  ];

export function AppHeader({
  mode,
  onModeChange,
  onOpenScoreGuide,
  onOpenDatasetInfo,
  onRefresh,
  onExit,
  refreshing,
  loadedAt,
  theme,
  onToggleTheme,
}: AppHeaderProps) {
  return (
    <header className="bg-card/80 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-3 backdrop-blur-md sm:px-4">
      {/* Brand */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg font-bold shadow-sm">
          P
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold tracking-tight">POLARIS</p>
          <p className="text-muted-foreground hidden truncate text-[10px] sm:block">
            Health facility siting · Talomo District
          </p>
        </div>
      </div>

      <Separator orientation="vertical" className="hidden h-7 sm:block" />

      {/* Mode switch */}
      <nav
        className="bg-muted/70 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
        aria-label="Analysis mode"
      >
        {MODES.map(({ id, label, icon: Icon, hint }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onModeChange(id)}
                aria-pressed={mode === id}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
                  mode === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Utilities */}
      <div className="flex shrink-0 items-center gap-1">
        <HeaderAction
          icon={<HelpCircle className="size-4" />}
          label="How to read scores"
          onClick={onOpenScoreGuide}
          emphasised
        />
        <HeaderAction
          icon={<Database className="size-4" />}
          label="Model and dataset"
          onClick={onOpenDatasetInfo}
        />
        <HeaderAction
          icon={
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          }
          label={
            loadedAt
              ? `Refresh data (loaded ${loadedAt.toLocaleTimeString()})`
              : "Refresh data"
          }
          onClick={onRefresh}
          disabled={refreshing}
        />
        <HeaderAction
          icon={
            theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />
          }
          label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          onClick={onToggleTheme}
        />

        <Separator orientation="vertical" className="mx-1 h-7" />

        <HeaderAction
          icon={<LogOut className="size-4" />}
          label="Back to start"
          onClick={onExit}
        />
      </div>
    </header>
  );
}

function HeaderAction({
  icon,
  label,
  onClick,
  disabled,
  emphasised,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasised?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={emphasised ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
