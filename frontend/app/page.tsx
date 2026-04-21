"use client";

import { useCallback, useEffect, useState, startTransition } from "react";

const API_BASE = "http://127.0.0.1:8000";
// const STREAM_URL = "http://10.2.10.176:81/stream";

type AlertItem = {
  timestamp: string;
  video_filename: string;
  event_type?: string;
};

export default function Home() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const errors: string[] = [];

    try {
      const alertsRes = await fetch(`${API_BASE}/alerts`);
      if (alertsRes.ok) {
        const data: unknown = await alertsRes.json();
        setAlerts(Array.isArray(data) ? (data as AlertItem[]) : []);
      } else if (alertsRes.status === 404) {
        setAlerts([]);
      } else {
        errors.push(`Alerts (${alertsRes.status})`);
      }
    } catch {
      errors.push("Alerts unreachable");
    }

    try {
      const recRes = await fetch(`${API_BASE}/recordings`);
      if (recRes.ok) {
        const recData: unknown = await recRes.json();
        setRecordings(Array.isArray(recData) ? (recData as string[]) : []);
      } else {
        errors.push(`Recordings (${recRes.status})`);
      }
    } catch {
      errors.push("Recordings unreachable");
    }

    setLoadError(errors.length > 0 ? errors.join(" · ") : null);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadData();
    });
    const id = setInterval(() => {
      startTransition(() => {
        void loadData();
      });
    }, 5000);
    return () => clearInterval(id);
  }, [loadData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Smart Security Camera Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Live view, alerts, and recordings refresh every 5 seconds
          </p>
        </header>

        {loadError && (
          <div
            className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {/* Live stream */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-medium text-slate-200">Live Stream</h2>
          <div className="flex justify-center">
            <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-xl shadow-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- MJPEG stream needs native img */}
              <img
                src="http://127.0.0.1:8000/live-stream"
                alt="Live stream"
                className="mx-auto block rounded-lg max-w-[600px] w-full"
              />
            </div>
          </div>
        </section>

        {/* Alerts */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-medium text-slate-200">Alerts</h2>
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 sm:p-6">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500">No alerts yet.</p>
            ) : (
              <ul className="divide-y divide-slate-700/80">
                {alerts.map((a, i) => (
                  <li
                    key={`${a.timestamp}-${a.video_filename}-${i}`}
                    className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <span className="font-mono text-sm text-emerald-400/90">
                      {a.timestamp}
                    </span>
                    <span className="text-sm text-slate-300">{a.video_filename}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Recordings */}
        <section>
          <h2 className="mb-4 text-lg font-medium text-slate-200">Recordings</h2>
          {recordings.length === 0 ? (
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-6 text-sm text-slate-500">
              No recordings found.
            </div>
          ) : (
            <ul className="space-y-6">
              {recordings.map((name) => (
                <li
                  key={name}
                  className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/50 shadow-lg shadow-black/20"
                >
                  <p className="border-b border-slate-700/80 px-4 py-3 text-sm font-medium text-slate-200">
                    {name}
                  </p>
                  <div className="p-4">
                    <video
                      className="mx-auto w-full max-h-[360px] rounded-lg bg-black"
                      controls
                      preload="metadata"
                      src={`${API_BASE}/recordings/${encodeURIComponent(name)}`}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
