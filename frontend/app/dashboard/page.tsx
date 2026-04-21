"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export default function DashboardHomePage() {
  const { loadError } = useDashboardData(true);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Overview · stream and system status
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
        <CardHeader className="space-y-1 pb-2">
          <CardTitle>Live stream</CardTitle>
          <CardDescription>
            MJPEG feed from your camera — refreshes with the browser
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element -- MJPEG stream needs native img */}
            <img
              src="http://127.0.0.1:8000/live-stream"
              alt="Live stream"
              className="mx-auto block max-w-[640px] w-full"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
