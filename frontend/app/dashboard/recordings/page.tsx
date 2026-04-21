"use client";

import { Film, HardDrive } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { parseRecordingFilename } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export default function RecordingsPage() {
  const { recordings, loadError } = useDashboardData(true);

  return (
    <div className="space-y-8">
      {loadError && (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 shadow-md transition-colors duration-300 dark:text-amber-100"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <div className="space-y-2">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Clips stored on the recorder. Hover a card for a light lift — playback uses
          your browser&apos;s controls.
        </p>
      </div>

      {recordings.length === 0 ? (
        <Card className="shadow-md transition-shadow duration-300">
          <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HardDrive className="size-6" aria-hidden />
            </div>
            <div>
              <p className="font-medium text-foreground">No recordings available</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Saved clips will show up here in a grid as soon as they exist.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {recordings.map((name) => {
            const meta = parseRecordingFilename(name);
            return (
              <li key={name}>
                <Card
                  className={cn(
                    "flex h-full flex-col overflow-hidden border border-border shadow-md",
                    "transition-all duration-200 ease-out",
                    "hover:scale-[1.02] hover:shadow-lg"
                  )}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black/80">
                    <video
                      className="h-full w-full object-cover"
                      controls
                      preload="metadata"
                      muted
                    >
                      <source
                        src={`http://127.0.0.1:8000/recordings/${encodeURIComponent(name)}`}
                        type="video/mp4"
                      />
                    </video>
                    <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
                      MP4
                    </span>
                  </div>
                  <CardHeader className="flex-1 space-y-1 pb-2 pt-4">
                    <div className="flex items-start gap-2">
                      <Film
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <CardTitle className="line-clamp-2 text-base font-semibold leading-snug">
                          {meta.displayTitle}
                        </CardTitle>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {name}
                        </p>
                      </div>
                    </div>
                    {meta.recordedLabel ? (
                      <CardDescription className="pt-1 text-xs sm:text-sm">
                        {meta.recordedLabel}
                      </CardDescription>
                    ) : (
                      <CardDescription className="pt-1 text-xs sm:text-sm">
                        Timestamp unavailable · file name shown above
                      </CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
