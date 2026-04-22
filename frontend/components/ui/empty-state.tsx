"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 bg-muted/20 px-8 py-16 text-center",
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        <Icon className="size-7" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-xs text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
