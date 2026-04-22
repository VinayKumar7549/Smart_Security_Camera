"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/admin"); }, [router]);
  return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">Redirecting…</div>;
}
