"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Mail, Phone, Shield, User } from "lucide-react";

import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { API_BASE, authHeaders, type PublicUser } from "@/lib/api";
import { cn } from "@/lib/utils";

function persistUser(u: PublicUser) {
  localStorage.setItem("user", JSON.stringify(u));
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [mailAlerts, setMailAlerts] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: authHeaders(),
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("auth");
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError(`Could not load (${res.status}).`);
        return;
      }
      const data = (await res.json()) as PublicUser;
      setUser(data);
      setMailAlerts(Boolean(data.email_notifications));
      persistUser(data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: boolean) {
    const previous = mailAlerts;
    setMailAlerts(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users/me/settings`, {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email_notifications: next }),
      });
      if (res.status === 401) {
        setMailAlerts(previous);
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setMailAlerts(previous);
        setError(`Save failed (${res.status}).`);
        return;
      }
      const data = (await res.json()) as PublicUser;
      setMailAlerts(Boolean(data.email_notifications));
      setUser(data);
      persistUser(data);
    } catch {
      setMailAlerts(previous);
      setError("Request failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  const initials = user?.username?.charAt(0).toUpperCase() ?? "U";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {error && (
        <div
          className="animate-fade-in-up rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Profile Card */}
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-md">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">Profile</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your account information
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-lg font-semibold text-foreground">
                {user?.username}
              </h3>
              <div className="flex flex-wrap gap-2">
                {user?.is_admin && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <Shield className="size-2.5" />
                    Admin
                  </span>
                )}
                <span className="inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {user?.is_admin ? "Administrator" : "Operator"}
                </span>
              </div>
            </div>
          </div>

          {/* Info rows */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
              <User className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Username
                </p>
                <p className="text-sm text-foreground">
                  {user?.username ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </p>
                <p className="text-sm text-foreground">
                  {user?.email ?? "Not set"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Phone
                </p>
                <p className="text-sm text-foreground">
                  {user?.phone ?? "Not set"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications Card */}
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-md">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            Notifications
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage how you receive alerts
          </p>
        </div>
        <div className="p-6">
          <ToggleSwitch
            id="mail-alerts"
            checked={mailAlerts}
            onChange={(checked) => void save(checked)}
            disabled={saving}
            label="Email alerts for motion"
            description="Receive an email when motion is detected on your assigned camera"
          />
        </div>
      </div>
    </div>
  );
}
