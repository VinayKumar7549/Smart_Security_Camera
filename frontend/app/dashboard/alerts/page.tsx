"use client";

import { Bell, Film, Inbox, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatAlertTimestamp } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export default function AlertsPage() {
  const { alerts, loadError } = useDashboardData(true);

  const sorted = [...alerts].reverse();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Security events triggered by motion detection. Data refreshes
          automatically every few seconds.
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

      {/* Alert Count Summary */}
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-5 py-3 shadow-sm">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {alerts.length === 0
              ? "No alerts recorded"
              : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} recorded`}
          </p>
          <p className="text-xs text-muted-foreground">
            Motion detection events from your cameras
          </p>
        </div>
      </div>

      {/* Alert List */}
      {sorted.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="All clear — no alerts yet"
          description="When motion is detected by your cameras, alerts will appear here in real time."
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((a, i) => (
            <div
              key={`${a.timestamp}-${a.video_filename}-${i}`}
              className={cn(
                "animate-fade-in-up group flex flex-col gap-3 rounded-xl border border-border/50 bg-card px-5 py-4 shadow-sm",
                "transition-all duration-200 ease-out",
                "hover:border-primary/20 hover:bg-muted/20 hover:shadow-md",
                "sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              )}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition-transform duration-200 group-hover:scale-110">
                  <Bell className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Motion Detected
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatAlertTimestamp(a.timestamp)}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 items-center gap-2 sm:max-w-[50%] sm:justify-end">
                <Film className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {a.video_filename}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
