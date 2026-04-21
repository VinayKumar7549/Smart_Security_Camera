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

export function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
