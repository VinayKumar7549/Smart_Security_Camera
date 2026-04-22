"use client";

import { Film, HardDrive, Play } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { parseRecordingFilename } from "@/lib/datetime";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function RecordingsPage() {
  const { recordings, loadError } = useDashboardData(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Motion-triggered recordings saved by your cameras. Hover a card to
          preview — playback uses your browser&apos;s native controls.
        </p>
      </div>

      {loadError && (
        <div
          className="animate-fade-in-up rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          role="alert"
        >
          {loadError}
        </div>
      )}

      {/* Count bar */}
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-5 py-3 shadow-sm">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HardDrive className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {recordings.length === 0
              ? "No recordings available"
              : `${recordings.length} recording${recordings.length === 1 ? "" : "s"}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Clips stored on the recorder
          </p>
        </div>
      </div>

      {recordings.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No recordings available"
          description="When motion triggers a recording, saved clips will appear here in a grid."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {recordings.map((name, i) => {
            const meta = parseRecordingFilename(name);
            return (
              <li
                key={name}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}
              >
                <div
                  className={cn(
                    "group flex h-full flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-md",
                    "transition-all duration-300 ease-out",
                    "hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5",
                    "hover:scale-[1.02]"
                  )}
                >
                  {/* Video preview */}
                  <div className="relative aspect-video w-full overflow-hidden bg-black/60">
                    <video
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      controls
                      preload="metadata"
                      muted
                    >
                      <source
                        src={`${API_BASE}/recordings/${encodeURIComponent(name)}`}
                        type="video/mp4"
                      />
                    </video>
                    {/* Format badge */}
                    <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm">
                      MP4
                    </span>
                    {/* Play overlay on hover */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/20">
                      <div className="flex size-12 items-center justify-center rounded-full bg-white/20 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 scale-75">
                        <Play className="size-5 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Card info */}
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <div className="flex items-start gap-2.5">
                      <Film className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug text-foreground">
                          {meta.displayTitle}
                        </h3>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                          {name}
                        </p>
                      </div>
                    </div>
                    {meta.recordedLabel && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meta.recordedLabel}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
