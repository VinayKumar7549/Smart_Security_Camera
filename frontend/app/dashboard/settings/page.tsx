"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const [mailAlerts, setMailAlerts] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users/me`, { headers: authHeaders() });
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
      const data: unknown = await res.json();
      const u = data as PublicUser;
      setMailAlerts(Boolean(u.email_notifications));
      persistUser(u);
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
      const data: unknown = await res.json();
      const u = data as PublicUser;
      setMailAlerts(Boolean(u.email_notifications));
      persistUser(u);
    } catch {
      setMailAlerts(previous);
      setError("Request failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {error && (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <label
            htmlFor="mail-alerts"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-3",
              "transition-colors hover:bg-muted/40",
              saving && "pointer-events-none opacity-60"
            )}
          >
            <input
              id="mail-alerts"
              type="checkbox"
              checked={mailAlerts}
              onChange={(e) => void save(e.target.checked)}
              disabled={saving}
              className="size-5 shrink-0 rounded-md border border-input accent-primary"
            />
            <span className="text-sm font-medium">Mail alerts for motion</span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
