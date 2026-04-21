"use client";

import { Bell, Inbox, Video } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatAlertTimestamp } from "@/lib/datetime";
import { cn } from "@/lib/utils";

export default function AlertsPage() {
  const { alerts, loadError } = useDashboardData(true);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Security events and motion alerts from your device. Data syncs every few
          seconds while this page is open.
        </p>
      </div>

      {loadError && (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 shadow-md transition-colors duration-300 dark:text-amber-100"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
        <CardHeader>
          <CardTitle>Recent alerts</CardTitle>
          <CardDescription>
            {alerts.length === 0
              ? "No alerts yet"
              : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} recorded`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center transition-colors duration-300">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" aria-hidden />
              </div>
              <div>
                <p className="font-medium text-foreground">No alerts yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When motion or events occur, they will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={`${a.timestamp}-${a.video_filename}-${i}`}>
                  <div
                    className={cn(
                      "group flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 shadow-sm",
                      "transition-all duration-200 ease-out",
                      "hover:border-primary/20 hover:bg-muted/50 hover:shadow-md",
                      "sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
                        <Bell className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug text-foreground">
                          {formatAlertTimestamp(a.timestamp)}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 sm:max-w-[55%] sm:justify-end">
                      <Video
                        className="size-4 shrink-0 text-muted-foreground opacity-70"
                        aria-hidden
                      />
                      <span className="truncate text-sm text-muted-foreground">
                        {a.video_filename}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
