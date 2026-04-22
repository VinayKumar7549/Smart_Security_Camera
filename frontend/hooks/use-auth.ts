"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "@/lib/api";

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("token");
    const raw = localStorage.getItem("user");
    if (t && raw) {
      try {
        setUser(JSON.parse(raw) as PublicUser);
        setToken(t);
      } catch {
        setUser(null);
        setToken(null);
      }
    }
    setReady(true);
  }, []);

  const isAuthenticated = Boolean(token && user);
  const isAdmin = Boolean(user?.is_admin);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("auth");
    setUser(null);
    setToken(null);
    router.push("/login");
  }, [router]);

  const updateUser = useCallback((u: PublicUser) => {
    localStorage.setItem("user", JSON.stringify(u));
    setUser(u);
  }, []);

  return { user, token, ready, isAuthenticated, isAdmin, logout, updateUser };
}
