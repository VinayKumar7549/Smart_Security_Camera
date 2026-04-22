"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Eye, EyeOff, Lock, Shield, User } from "lucide-react";

import { API_BASE, type PublicUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
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
            : "Invalid credentials";
        setError(msg);
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
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("auth", "true");
      router.push("/dashboard");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      {/* Background grid */}
      <div className="dot-grid-bg fixed inset-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/10">
            <Shield className="size-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              SentinelVue
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Smart Security Camera System
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xl">
          <div className="px-8 pb-2 pt-8">
            <h2 className="text-lg font-semibold text-foreground">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to your security dashboard
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="px-8 pb-8 pt-6">
            <div className="space-y-4">
              {/* Username */}
              <div className="space-y-2">
                <label
                  htmlFor="username"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="h-11 w-full rounded-xl border border-border/50 bg-muted/30 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary/50 focus:bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="h-11 w-full rounded-xl border border-border/50 bg-muted/30 pl-10 pr-11 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary/50 focus:bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="animate-fade-in-up rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="relative flex h-11 w-full items-center justify-center rounded-xl bg-primary font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all duration-200 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    Signing in…
                  </div>
                ) : (
                  "Sign in"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          Secure access · Smart Security Camera System
        </p>
      </div>
    </div>
  );
}
