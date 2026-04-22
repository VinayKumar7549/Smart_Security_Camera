"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import {
  getAlerts,
  getRecordings,
  getCameraStatus,
  getAlertCount,
  getHealth,
  type AlertItem,
  type CameraStatus,
} from "@/lib/api";

export type { AlertItem };

export function useDashboardData(enabled: boolean) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [cameras, setCameras] = useState<CameraStatus[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [streamOnline, setStreamOnline] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const errors: string[] = [];

    try {
      const data = await getAlerts();
      setAlerts(data);
    } catch {
      errors.push("Alerts unreachable");
    }

    try {
      const data = await getRecordings();
      setRecordings(data);
    } catch {
      errors.push("Recordings unreachable");
    }

    try {
      const data = await getCameraStatus();
      setCameras(data);
    } catch {
      /* silent */
    }

    try {
      const data = await getAlertCount();
      setAlertCount(data.count);
      setTotalAlerts(data.total);
    } catch {
      /* silent */
    }

    try {
      const data = await getHealth();
      setStreamOnline(data.stream_thread_alive && data.live_frame_available);
    } catch {
      setStreamOnline(false);
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

  return {
    alerts,
    recordings,
    cameras,
    alertCount,
    totalAlerts,
    streamOnline,
    loadError,
  };
}
