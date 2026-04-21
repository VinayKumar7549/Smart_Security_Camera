"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardData } from "@/hooks/use-dashboard-data";

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
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 shadow-md dark:text-amber-100"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Recent alerts</CardTitle>
          <CardDescription>
            {alerts.length === 0
              ? "No alerts yet — you’re all clear."
              : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} recorded`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {alerts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No alerts to show.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
              {alerts.map((a, i) => (
                <li
                  key={`${a.timestamp}-${a.video_filename}-${i}`}
                  className="flex flex-col gap-1 px-4 py-4 first:pt-4 last:pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <span className="font-mono text-sm text-foreground">{a.timestamp}</span>
                  <span className="text-sm text-muted-foreground">{a.video_filename}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
