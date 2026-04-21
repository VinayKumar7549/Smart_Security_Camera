"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

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
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 shadow-md transition-colors duration-300 dark:text-amber-100"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl">
        <Card
          className={cn(
            "overflow-hidden border border-border shadow-md transition-shadow duration-300",
            "hover:shadow-lg"
          )}
        >
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Live stream</CardTitle>
            <CardDescription>
              MJPEG feed from your camera — aspect ratio preserved in the frame
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-6 sm:px-6">
            <div
              className={cn(
                "relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-muted/40 shadow-inner",
                "aspect-video max-h-[min(72vh,720px)] transition-transform duration-300 ease-out",
                "hover:scale-[1.005]"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- MJPEG stream needs native img */}
              <img
                src="http://127.0.0.1:8000/live-stream"
                alt="Live stream"
                className="h-full w-full object-contain"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
