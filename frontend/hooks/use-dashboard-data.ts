"use client";

import { useCallback, useEffect, useState, startTransition } from "react";

const API_BASE = "http://127.0.0.1:8000";

export type AlertItem = {
  timestamp: string;
  video_filename: string;
  event_type?: string;
};

export function useDashboardData(enabled: boolean) {
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
    if (!enabled) return;
    startTransition(() => {
      void loadData();
    });
    const id = setInterval(() => {
      startTransition(() => {
        void loadData();
      });
    }, 5000);
    return () => clearInterval(id);
  }, [enabled, loadData]);

  return { alerts, recordings, loadError };
}
