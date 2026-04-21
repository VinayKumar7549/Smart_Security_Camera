"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE, type PublicUser } from "@/lib/api";

/** Only this account may sign in here (must match server-seeded admin). */
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "1234";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const u = username.trim();
    const p = password.trim();
    if (u !== ADMIN_USERNAME || p !== ADMIN_PASSWORD) {
      setError("Invalid credentials");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          password: p,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        const msg =
          detail &&
          typeof detail === "object" &&
          "detail" in detail &&
          typeof (detail as { detail: unknown }).detail === "string"
            ? (detail as { detail: string }).detail
            : null;
        setError(
          msg
            ? `Login failed: ${msg}`
            : "Invalid credentials — is the API running and reachable?"
        );
        return;
      }
      const data: unknown = await res.json();
      if (
        typeof data !== "object" ||
        data === null ||
        !("token" in data) ||
        !("user" in data)
      ) {
        setError("Unexpected response from server.");
        return;
      }
      const token = (data as { token: string }).token;
      const user = (data as { user: PublicUser }).user;
      if (!user.is_admin) {
        setError("This account is not an administrator.");
        return;
      }
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("auth", "true");
      router.push("/admin");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-900">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Administrator sign in
          </CardTitle>
          <CardDescription>
            Smart Security — admin console only. Use the administrator account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="admin-username">Username</Label>
              <Input
                id="admin-username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="rounded-xl shadow-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                className="rounded-xl shadow-sm"
                required
              />
            </div>
            {error && (
              <p
                className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl shadow-md sm:w-auto"
            >
              {submitting ? "Signing in…" : "Sign in as admin"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
