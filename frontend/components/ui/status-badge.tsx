"use client";

import { cn } from "@/lib/utils";

type StatusVariant = "online" | "offline" | "recording" | "warning";

const variants: Record<StatusVariant, { dot: string; label: string; text: string }> = {
  online: {
    dot: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
    label: "Online",
    text: "text-emerald-400",
  },
  offline: {
    dot: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]",
    label: "Offline",
    text: "text-red-400",
  },
  recording: {
    dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)] animate-pulse",
    label: "Recording",
    text: "text-amber-400",
  },
  warning: {
    dot: "bg-amber-400",
    label: "Warning",
    text: "text-amber-400",
  },
};

export function StatusBadge({
  variant = "offline",
  label,
  className,
}: {
  variant?: StatusVariant;
  label?: string;
  className?: string;
}) {
  const v = variants[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 px-2.5 py-1 text-xs font-medium",
        v.text,
        className
      )}
    >
      <span className={cn("inline-block size-2 rounded-full", v.dot)} />
      {label ?? v.label}
    </span>
  );
}
