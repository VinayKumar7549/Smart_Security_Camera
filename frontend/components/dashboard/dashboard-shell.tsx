"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Clapperboard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";
import { getAlertCount } from "@/lib/api";

const APP_NAME = "SentinelVue";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/recordings", label: "Recordings", icon: Clapperboard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  if (href === "/dashboard/admin") {
    return pathname.startsWith("/dashboard/admin");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/dashboard/admin")) return "Admin";
  if (pathname.startsWith("/dashboard/settings")) return "Settings";
  if (pathname.startsWith("/dashboard/alerts")) return "Alerts";
  if (pathname.startsWith("/dashboard/recordings")) return "Recordings";
  return "Dashboard";
}

function SidebarNav({
  pathname,
  onNavigate,
  showAdmin,
}: {
  pathname: string;
  onNavigate?: () => void;
  showAdmin?: boolean;
}) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = navActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "border-l-2 border-primary bg-primary/10 text-primary shadow-sm"
                : "border-l-2 border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {label}
          </Link>
        );
      })}
      {showAdmin && (
        <>
          <div className="mx-3 my-2 h-px bg-border/50" />
          <Link
            href="/dashboard/admin"
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
              navActive(pathname, "/dashboard/admin")
                ? "border-l-2 border-primary bg-primary/10 text-primary shadow-sm"
                : "border-l-2 border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Shield
              className={cn(
                "size-4 shrink-0 transition-colors",
                navActive(pathname, "/dashboard/admin")
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            Admin
          </Link>
        </>
      )}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [username, setUsername] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [alertBadge, setAlertBadge] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userRaw = localStorage.getItem("user");
    if (!token || !userRaw) {
      router.replace("/login");
      setAuthorized(false);
    } else {
      setAuthorized(true);
      try {
        const u = JSON.parse(userRaw) as {
          is_admin?: boolean;
          username?: string;
          email?: string | null;
        };
        setShowAdmin(Boolean(u.is_admin));
        setUsername(u.username ?? "User");
        setUserEmail(u.email ?? "");
      } catch {
        setShowAdmin(false);
        setUsername("User");
      }
    }
    setAuthReady(true);
  }, [router, pathname]);

  // Alert badge polling
  useEffect(() => {
    if (!authorized) return;
    const load = async () => {
      const data = await getAlertCount();
      setAlertBadge(data.count);
    };
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => clearInterval(id);
  }, [authorized]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("auth");
    router.push("/login");
  }

  if (!authReady || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  const title = pageTitle(pathname);
  const initials = username.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* ── Desktop Sidebar ──────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/50 bg-sidebar md:flex">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-border/50 px-5 py-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Shield className="size-4" />
          </div>
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-bold tracking-tight text-foreground"
            >
              {APP_NAME}
            </Link>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Security
            </p>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav pathname={pathname} showAdmin={showAdmin} />
        </div>

        {/* Sidebar footer */}
        <div className="border-t border-border/50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {username}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {showAdmin ? "Administrator" : "Operator"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border/50 bg-sidebar shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Shield className="size-4" />
                </div>
                <span className="text-sm font-bold text-foreground">{APP_NAME}</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="py-2">
              <SidebarNav
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                showAdmin={showAdmin}
              />
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content Area ─────────────────────────── */}
      <div className="flex min-h-screen flex-col md:pl-60">
        {/* ── Top Navbar ──────────────────────────────── */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border/50 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          {/* Left: hamburger + title */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="flex size-9 items-center justify-center rounded-lg border border-border/50 text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Notification bell */}
            <Link
              href="/dashboard/alerts"
              className="relative flex size-9 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/30 hover:text-primary hover:shadow-md"
              aria-label="View alerts"
            >
              <Bell className="size-4" />
              {alertBadge > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm">
                  {alertBadge > 9 ? "9+" : alertBadge}
                </span>
              )}
            </Link>

            <ModeToggle />

            {/* User dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-2.5 py-1.5 text-sm shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {initials}
                </div>
                <span className="hidden text-xs font-medium text-foreground sm:inline">
                  {username}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-border/50 bg-card shadow-xl">
                  <div className="border-b border-border/50 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{username}</p>
                    <p className="text-xs text-muted-foreground">
                      {userEmail || (showAdmin ? "Administrator" : "Operator")}
                    </p>
                    {showAdmin && (
                      <span className="mt-1.5 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="p-1.5">
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      <User className="size-3.5" />
                      Profile & Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                    >
                      <LogOut className="size-3.5" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Page content ────────────────────────────── */}
        <main className="dot-grid-bg flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
