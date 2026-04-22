export const API_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE
    ? process.env.NEXT_PUBLIC_API_BASE
    : "http://127.0.0.1:8000";

export type PublicUser = {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  is_admin: boolean;
  email_notifications: boolean;
};

export type CameraRow = {
  id: number;
  camera_name: string;
  assigned_user_id: number | null;
};

export type CameraStatus = {
  id: number;
  camera_name: string;
  assigned_user_id: number | null;
  online: boolean;
};

export type AlertItem = {
  timestamp: string;
  video_filename: string;
  event_type?: string;
};

export function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function fetchWithAuth(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const headers = {
    ...authHeaders(),
    ...(init?.headers ?? {}),
  };
  return fetch(url, { ...init, headers });
}

export async function getAlerts(): Promise<AlertItem[]> {
  try {
    const res = await fetch(`${API_BASE}/alerts`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as AlertItem[]) : [];
  } catch {
    return [];
  }
}

export async function getRecordings(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/recordings`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as string[]) : [];
  } catch {
    return [];
  }
}

export async function getCameraStatus(): Promise<CameraStatus[]> {
  try {
    const res = await fetch(`${API_BASE}/cameras/status`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as CameraStatus[]) : [];
  } catch {
    return [];
  }
}

export async function getAlertCount(): Promise<{
  count: number;
  total: number;
}> {
  try {
    const res = await fetch(`${API_BASE}/alerts/count`);
    if (!res.ok) return { count: 0, total: 0 };
    return (await res.json()) as { count: number; total: number };
  } catch {
    return { count: 0, total: 0 };
  }
}

export async function getHealth(): Promise<{
  status: string;
  stream_thread_alive: boolean;
  live_frame_available: boolean;
}> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok)
      return {
        status: "error",
        stream_thread_alive: false,
        live_frame_available: false,
      };
    return (await res.json()) as {
      status: string;
      stream_thread_alive: boolean;
      live_frame_available: boolean;
    };
  } catch {
    return {
      status: "error",
      stream_thread_alive: false,
      live_frame_available: false,
    };
  }
}
