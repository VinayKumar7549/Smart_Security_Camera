"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardData } from "@/hooks/use-dashboard-data";

export default function RecordingsPage() {
  const { recordings, loadError } = useDashboardData(true);

  return (
    <div className="space-y-6">
      {loadError && (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 shadow-md dark:text-amber-100"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <div className="space-y-2">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Clips stored on the recorder. Playback uses your browser&apos;s built-in
          controls.
        </p>
      </div>

      {recordings.length === 0 ? (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No recordings found.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-8">
          {recordings.map((name) => (
            <li key={name}>
              <Card className="overflow-hidden shadow-md">
                <CardHeader className="border-b border-border py-4">
                  <CardTitle className="text-base font-medium">{name}</CardTitle>
                  <CardDescription>MP4 · served from your security server</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 pb-8">
                  <div className="overflow-hidden rounded-xl border border-border bg-black/5 shadow-sm dark:bg-black/40">
                    <video
                      className="mx-auto w-full max-w-[640px]"
                      controls
                      preload="metadata"
                    >
                      <source
                        src={`http://127.0.0.1:8000/recordings/${encodeURIComponent(name)}`}
                        type="video/mp4"
                      />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
