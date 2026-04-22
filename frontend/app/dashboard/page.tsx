"use client";

import { Activity, AlertTriangle, Bell, Film, Wifi } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { CardSkeleton, StreamSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatAlertTimestamp } from "@/lib/datetime";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function DashboardHomePage() {
  const {
    alerts,
    recordings,
    cameras,
    alertCount,
    totalAlerts,
    streamOnline,
    loadError,
  } = useDashboardData(true);

  const cameraName = cameras.length > 0 ? cameras[0].camera_name : "Main Camera";
  const recentAlerts = alerts.slice(-5).reverse();

  return (
    <div className="space-y-6">
      {loadError && (
        <div
          className="animate-fade-in-up rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          role="alert"
        >
          <AlertTriangle className="mr-2 inline size-4" />
          {loadError}
        </div>
      )}

      {/* ── Stats Row ──────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Bell}
          label="Alerts (24h)"
          value={alertCount}
          detail={`${totalAlerts} total`}
        />
        <StatCard
          icon={Film}
          label="Recordings"
          value={recordings.length}
          detail="Saved clips"
        />
        <StatCard
          icon={Wifi}
          label="Camera"
          value={streamOnline ? "Online" : "Offline"}
          detail={cameraName}
          accentColor={
            streamOnline
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }
        />
        <StatCard
          icon={Activity}
          label="System"
          value={streamOnline ? "Active" : "Down"}
          detail="Stream processor"
          accentColor={
            streamOnline
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }
        />
      </div>

      {/* ── Main Grid: Stream + Alerts ─────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Live Stream Card */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-md transition-shadow duration-300 hover:shadow-lg">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Live Stream
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cameraName} — real-time MJPEG feed
                </p>
              </div>
              <StatusBadge variant={streamOnline ? "online" : "offline"} />
            </div>
            <div className="px-5 pb-5">
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg border border-border/30 bg-black/40",
                  "aspect-video transition-transform duration-300 ease-out",
                  "hover:scale-[1.003]"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}/live-stream`}
                  alt="Live camera stream"
                  className="h-full w-full object-contain"
                />
                {/* LIVE indicator */}
                {streamOnline && (
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg backdrop-blur-sm">
                    <span className="inline-block size-1.5 animate-pulse rounded-full bg-white" />
                    Live
                  </div>
                )}
                {/* Camera name overlay */}
                <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
                  {cameraName}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Alerts Panel */}
        <div className="lg:col-span-1">
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-md">
            <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Recent Alerts
                </h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Last 5 events
                </p>
              </div>
              {alertCount > 0 && (
                <span className="flex size-6 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-bold text-red-400">
                  {alertCount}
                </span>
              )}
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {recentAlerts.length === 0 ? (
                <div className="px-5 py-12">
                  <EmptyState
                    icon={Bell}
                    title="All clear"
                    description="No motion alerts have been triggered yet."
                    className="border-0 bg-transparent py-6"
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border/30">
                  {recentAlerts.map((a, i) => (
                    <li
                      key={`${a.timestamp}-${i}`}
                      className="animate-fade-in-up group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition-transform duration-200 group-hover:scale-110">
                        <Bell className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          Motion detected
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {formatAlertTimestamp(a.timestamp)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
