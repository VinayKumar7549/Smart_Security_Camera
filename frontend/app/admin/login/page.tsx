"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, [router]);
  return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">Redirecting…</div>;
}
