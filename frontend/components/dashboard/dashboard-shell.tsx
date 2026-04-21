"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Clapperboard, LayoutDashboard, Menu } from "lucide-react";
import { useEffect, useState } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const APP_NAME = "Smart Security";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/recordings", label: "Recordings", icon: Clapperboard },
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard/alerts")) return "Alerts";
  if (pathname.startsWith("/dashboard/recordings")) return "Recordings";
  return "Dashboard";
}

function SidebarNav({
  pathname,
  onNavigate,
  className,
}: {
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-col gap-1 p-4", className)}>
      {nav.map(({ href, label, icon: Icon }) => {
        const active = navActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("auth") === "true") {
      setAuthorized(true);
    } else {
      router.replace("/login");
    }
    setAuthReady(true);
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("auth");
    router.push("/login");
  }

  if (!authReady || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-muted-foreground dark:bg-gray-900">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  const title = pageTitle(pathname);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen w-56 flex-col border-r border-border bg-card shadow-md md:flex md:flex-col">
        <div className="border-b border-border px-6 py-5">
          <Link href="/dashboard" className="font-semibold tracking-tight text-foreground">
            {APP_NAME}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">Camera control</p>
        </div>
        <SidebarNav pathname={pathname} className="flex-1" />
      </aside>

      <div className="flex min-h-screen flex-col md:pl-56">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/90 px-4 shadow-md backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                className={cn(
                  buttonVariants({ variant: "outline", size: "icon-sm" }),
                  "rounded-xl shadow-md md:hidden"
                )}
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b border-border px-6 py-4 text-left">
                  <SheetTitle className="font-semibold">{APP_NAME}</SheetTitle>
                </SheetHeader>
                <SidebarNav
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ModeToggle />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl shadow-md"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
