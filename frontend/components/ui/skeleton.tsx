"use client";

import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-muted/60",
        className
      )}
    />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card p-5 shadow-md",
        className
      )}
    >
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-2 h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function StreamSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-md">
      <div className="p-5 pb-3">
        <Skeleton className="mb-2 h-5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="px-5 pb-5">
        <Skeleton className="aspect-video w-full rounded-lg" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
