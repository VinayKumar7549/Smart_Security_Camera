"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE, authHeaders, type CameraRow, type PublicUser } from "@/lib/api";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export default function AdminPage() {
  const router = useRouter();
  const [gateOk, setGateOk] = useState(false);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [assignCameraId, setAssignCameraId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editMailAlerts, setEditMailAlerts] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      router.replace("/admin/login");
      return;
    }
    try {
      const u = JSON.parse(raw) as PublicUser;
      if (!u.is_admin) {
        router.replace("/dashboard");
        return;
      }
    } catch {
      router.replace("/admin/login");
      return;
    }
    setGateOk(true);
    try {
      const raw = localStorage.getItem("user");
      if (raw) setCurrentUserId((JSON.parse(raw) as PublicUser).id);
    } catch {
      setCurrentUserId(null);
    }
  }, [router]);

  const refreshData = useCallback(async () => {
    setLoadError(null);
    try {
      const [uRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, { headers: authHeaders() }),
        fetch(`${API_BASE}/admin/cameras`, { headers: authHeaders() }),
      ]);
      if (uRes.status === 401 || cRes.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("auth");
        router.replace("/admin/login");
        return;
      }
      if (!uRes.ok) {
        setLoadError(`Users (${uRes.status})`);
        return;
      }
      if (!cRes.ok) {
        setLoadError(`Cameras (${cRes.status})`);
        return;
      }
      const uData: unknown = await uRes.json();
      const cData: unknown = await cRes.json();
      const list = Array.isArray(uData) ? (uData as PublicUser[]) : [];
      setUsers(list);
      setCameras(Array.isArray(cData) ? (cData as CameraRow[]) : []);
      setAssignUserId((prev) => {
        if (prev !== "") return prev;
        const adminUser = list.find((u) => u.username === "admin");
        return adminUser ? String(adminUser.id) : "";
      });
    } catch {
      setLoadError("Could not reach the server.");
    }
  }, [router]);

  useEffect(() => {
    if (!gateOk) return;
    void refreshData();
  }, [gateOk, refreshData]);

  async function handleCreateUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
        }),
      });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (res.status === 409) {
        setCreateError("That username is already taken.");
        return;
      }
      if (!res.ok) {
        setCreateError(`Could not create user (${res.status}).`);
        return;
      }
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setNewPhone("");
      await refreshData();
    } catch {
      setCreateError("Request failed.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAssign() {
    setAssignError(null);
    const cid = Number.parseInt(assignCameraId, 10);
    const uid = Number.parseInt(assignUserId, 10);
    if (Number.isNaN(cid) || Number.isNaN(uid)) {
      setAssignError("Select a camera and user.");
      return;
    }
    setAssigning(true);
    try {
      const res = await fetch(`${API_BASE}/admin/cameras/assign`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ camera_id: cid, user_id: uid }),
      });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        const msg =
          typeof detail === "object" && detail && "detail" in detail
            ? String((detail as { detail: string }).detail)
            : `Assign failed (${res.status})`;
        setAssignError(msg);
        return;
      }
      await refreshData();
    } catch {
      setAssignError("Request failed.");
    } finally {
      setAssigning(false);
    }
  }

  function openEditSheet(u: PublicUser) {
    setEditingUser(u);
    setEditUsername(u.username);
    setEditEmail(u.email ?? "");
    setEditPhone(u.phone ?? "");
    setEditPassword("");
    setEditIsAdmin(u.is_admin);
    setEditMailAlerts(u.email_notifications);
    setEditError(null);
    setSheetOpen(true);
  }

  async function handleSaveEdit() {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    const trimmedUser = editUsername.trim();
    if (!trimmedUser) {
      setEditError("Username is required.");
      setEditSaving(false);
      return;
    }
    try {
      const body: Record<string, unknown> = {
        username: trimmedUser,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        is_admin: editIsAdmin,
        email_notifications: editMailAlerts,
      };
      if (editPassword.trim()) {
        body.password = editPassword.trim();
      }
      const res = await fetch(`${API_BASE}/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (res.status === 409) {
        setEditError("That username is already taken.");
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        const msg =
          typeof detail === "object" && detail && "detail" in detail
            ? String((detail as { detail: string }).detail)
            : `Save failed (${res.status})`;
        setEditError(msg);
        return;
      }
      const data: unknown = await res.json();
      const updated = data as PublicUser;
      if (currentUserId === editingUser.id) {
        localStorage.setItem("user", JSON.stringify(updated));
      }
      setSheetOpen(false);
      setEditingUser(null);
      setEditPassword("");
      await refreshData();
    } catch {
      setEditError("Request failed.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteUser(u: PublicUser) {
    if (
      !window.confirm(
        `Delete user “${u.username}” permanently? Camera assignments for this user will be cleared.`
      )
    ) {
      return;
    }
    setDeleteBusyId(u.id);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${u.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        const msg =
          typeof detail === "object" && detail && "detail" in detail
            ? String((detail as { detail: string }).detail)
            : `Delete failed (${res.status})`;
        window.alert(msg);
        return;
      }
      await refreshData();
    } catch {
      window.alert("Request failed.");
    } finally {
      setDeleteBusyId(null);
    }
  }

  if (!gateOk) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Create operators with an email, assign a camera to them, and turn on email notifications
          for that user. Motion alerts use the assigned operator&apos;s email once SMTP is set in
          the server <code className="text-xs">.env</code>.
        </p>
      </div>

      {loadError && (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {loadError}
        </div>
      )}

      <Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
        <CardHeader>
          <CardTitle>Create user</CardTitle>
          <CardDescription>
            Operators sign in at <code className="text-xs">/login</code>. Give each user a unique
            username and their real email so they can receive motion alerts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleCreateUser(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-username">Username</Label>
                <Input
                  id="new-username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  autoComplete="off"
                  className="rounded-xl shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="rounded-xl shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  autoComplete="off"
                  className="rounded-xl shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-phone">Phone</Label>
                <Input
                  id="new-phone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  autoComplete="off"
                  className="rounded-xl shadow-sm"
                />
              </div>
            </div>
            {createError && (
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            )}
            <Button
              type="submit"
              disabled={creating}
              className="rounded-xl shadow-md transition-transform duration-200 hover:scale-[1.02] active:scale-100"
            >
              {creating ? "Creating…" : "Create User"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
        <CardHeader>
          <CardTitle>Assign camera to user</CardTitle>
          <CardDescription>
            The assigned user receives motion alerts at their email (when enabled in Settings).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assign-camera">Camera</Label>
              <select
                id="assign-camera"
                className={cn(selectClass)}
                value={assignCameraId}
                onChange={(e) => setAssignCameraId(e.target.value)}
              >
                <option value="">Select camera…</option>
                {cameras.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.camera_name} (id {c.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-user">User</Label>
              <select
                id="assign-user"
                className={cn(selectClass)}
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              >
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.username} (id {u.id})
                  </option>
                ))}
              </select>
            </div>
          </div>
          {assignError && (
            <p className="text-sm text-destructive" role="alert">
              {assignError}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={assigning}
            onClick={() => void handleAssign()}
            className="rounded-xl shadow-md transition-transform duration-200 hover:scale-[1.02] active:scale-100"
          >
            {assigning ? "Assigning…" : "Assign camera"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Edit details, change password, or remove accounts.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Username</th>
                <th className="pb-3 pr-4 font-medium">Email</th>
                <th className="pb-3 pr-4 font-medium">Phone</th>
                <th className="pb-3 pr-4 font-medium">Admin</th>
                <th className="pb-3 pr-4 font-medium">Mail alerts</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const deleteDisabled =
                  u.username === "admin" || u.id === currentUserId || deleteBusyId === u.id;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border/80 transition-colors duration-200 last:border-0 hover:bg-muted/40"
                  >
                    <td className="py-3 pr-4 font-medium">{u.username}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{u.email ?? "—"}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{u.phone ?? "—"}</td>
                    <td className="py-3 pr-4">{u.is_admin ? "Yes" : "No"}</td>
                    <td className="py-3 pr-4">{u.email_notifications ? "On" : "Off"}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => openEditSheet(u)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-destructive/50 text-destructive hover:bg-destructive/10"
                          disabled={deleteDisabled}
                          onClick={() => void handleDeleteUser(u)}
                        >
                          {deleteBusyId === u.id ? "…" : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No users yet.</p>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditingUser(null);
            setEditPassword("");
            setEditError(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit user</SheetTitle>
          </SheetHeader>
          {editingUser && (
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              {editError && (
                <p className="text-sm text-destructive" role="alert">
                  {editError}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  autoComplete="off"
                  className="rounded-xl shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  autoComplete="off"
                  className="rounded-xl shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  autoComplete="off"
                  className="rounded-xl shadow-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">New password</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  autoComplete="new-password"
                  className="rounded-xl shadow-sm"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={(e) => setEditIsAdmin(e.target.checked)}
                  disabled={editingUser.username === "admin"}
                  className="size-5 rounded-md border border-input accent-primary disabled:opacity-50"
                />
                <span className="text-sm font-medium">Administrator</span>
              </label>
              {editingUser.username === "admin" && (
                <p className="text-xs text-muted-foreground">
                  The built-in admin account always keeps administrator access.
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2">
                <input
                  type="checkbox"
                  checked={editMailAlerts}
                  onChange={(e) => setEditMailAlerts(e.target.checked)}
                  className="size-5 rounded-md border border-input accent-primary"
                />
                <span className="text-sm font-medium">Mail alerts for motion</span>
              </label>
            </div>
          )}
          <SheetFooter className="border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={editSaving}
              onClick={() => setSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={editSaving || !editingUser}
              onClick={() => void handleSaveEdit()}
            >
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Cameras</CardTitle>
          <CardDescription>Assignment state for each camera.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Name</th>
                <th className="pb-3 font-medium">Assigned user id</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border/80 transition-colors duration-200 last:border-0 hover:bg-muted/40"
                >
                  <td className="py-3 pr-4 font-medium">{c.camera_name}</td>
                  <td className="py-3 text-muted-foreground">
                    {c.assigned_user_id ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cameras.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No cameras in the database.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
