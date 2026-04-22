"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Camera, Plus, Trash2, Edit, Users, Shield } from "lucide-react";

import { API_BASE, authHeaders, type CameraRow, type PublicUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import { useDashboardData } from "@/hooks/use-dashboard-data";

const selectClass =
  "flex h-10 w-full rounded-xl border border-border/50 bg-muted/30 px-3 py-1 text-sm transition-colors outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

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

  const { alertCount, recordings, streamOnline } = useDashboardData(gateOk);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) { router.replace("/login"); return; }
    try {
      const u = JSON.parse(raw) as PublicUser;
      if (!u.is_admin) { router.replace("/dashboard"); return; }
      setCurrentUserId(u.id);
    } catch { router.replace("/login"); return; }
    setGateOk(true);
  }, [router]);

  const refreshData = useCallback(async () => {
    setLoadError(null);
    try {
      const [uRes, cRes] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, { headers: authHeaders() }),
        fetch(`${API_BASE}/admin/cameras`, { headers: authHeaders() }),
      ]);
      if (uRes.status === 401 || cRes.status === 401) {
        localStorage.removeItem("token"); localStorage.removeItem("user");
        router.replace("/login"); return;
      }
      if (!uRes.ok || !cRes.ok) { setLoadError("Failed to load data"); return; }
      const uData = (await uRes.json()) as PublicUser[];
      const cData = (await cRes.json()) as CameraRow[];
      setUsers(Array.isArray(uData) ? uData : []);
      setCameras(Array.isArray(cData) ? cData : []);
    } catch { setLoadError("Could not reach the server."); }
  }, [router]);

  useEffect(() => { if (gateOk) void refreshData(); }, [gateOk, refreshData]);

  async function handleCreateUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setCreateError(null); setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, email: newEmail.trim() || null, phone: newPhone.trim() || null }),
      });
      if (res.status === 401) { router.replace("/login"); return; }
      if (res.status === 409) { setCreateError("Username already taken."); return; }
      if (!res.ok) { setCreateError(`Error (${res.status}).`); return; }
      setNewUsername(""); setNewPassword(""); setNewEmail(""); setNewPhone("");
      await refreshData();
    } catch { setCreateError("Request failed."); } finally { setCreating(false); }
  }

  async function handleAssign() {
    setAssignError(null);
    const cid = Number(assignCameraId), uid = Number(assignUserId);
    if (!cid || !uid) { setAssignError("Select camera and user."); return; }
    setAssigning(true);
    try {
      const res = await fetch(`${API_BASE}/admin/cameras/assign`, {
        method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ camera_id: cid, user_id: uid }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAssignError(typeof d === "object" && d && "detail" in d ? String((d as {detail:string}).detail) : "Failed"); return; }
      await refreshData();
    } catch { setAssignError("Request failed."); } finally { setAssigning(false); }
  }

  function openEdit(u: PublicUser) {
    setEditingUser(u); setEditUsername(u.username); setEditEmail(u.email ?? "");
    setEditPhone(u.phone ?? ""); setEditPassword(""); setEditIsAdmin(u.is_admin);
    setEditMailAlerts(u.email_notifications); setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingUser) return;
    setEditSaving(true); setEditError(null);
    if (!editUsername.trim()) { setEditError("Username required."); setEditSaving(false); return; }
    try {
      const body: Record<string,unknown> = { username: editUsername.trim(), email: editEmail.trim() || null, phone: editPhone.trim() || null, is_admin: editIsAdmin, email_notifications: editMailAlerts };
      if (editPassword.trim()) body.password = editPassword.trim();
      const res = await fetch(`${API_BASE}/admin/users/${editingUser.id}`, {
        method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) { setEditError("Username taken."); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(typeof d === "object" && d && "detail" in d ? String((d as {detail:string}).detail) : "Failed"); return; }
      const updated = await res.json() as PublicUser;
      if (currentUserId === editingUser.id) localStorage.setItem("user", JSON.stringify(updated));
      setEditingUser(null); await refreshData();
    } catch { setEditError("Request failed."); } finally { setEditSaving(false); }
  }

  async function handleDelete(u: PublicUser) {
    if (!confirm(`Delete "${u.username}" permanently?`)) return;
    setDeleteBusyId(u.id);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${u.id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(typeof d === "object" && d && "detail" in d ? String((d as {detail:string}).detail) : "Failed"); return; }
      await refreshData();
    } catch { alert("Request failed."); } finally { setDeleteBusyId(null); }
  }

  if (!gateOk) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      {loadError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{loadError}</div>}

      {/* System Overview */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Users" value={users.length} detail="Total accounts" />
        <StatCard icon={Camera} label="Cameras" value={cameras.length} detail="Registered" />
        <StatCard icon={Shield} label="Alerts (24h)" value={alertCount} />
        <StatCard icon={Camera} label="Stream" value={streamOnline ? "Online" : "Offline"} accentColor={streamOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"} />
      </div>

      {/* Create User */}
      <div className="rounded-xl border border-border/50 bg-card shadow-md">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">Create User</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Add a new operator account</p>
        </div>
        <form onSubmit={(e) => void handleCreateUser(e)} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Username</label>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} required className={selectClass} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoComplete="new-password" className={selectClass} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" className={selectClass} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} className={selectClass} />
            </div>
          </div>
          {createError && <p className="text-sm text-red-400">{createError}</p>}
          <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50">
            <Plus className="size-4" />{creating ? "Creating…" : "Create User"}
          </button>
        </form>
      </div>

      {/* Assign Camera */}
      <div className="rounded-xl border border-border/50 bg-card shadow-md">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">Assign Camera</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Link a camera to a user for motion alerts</p>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Camera</label>
              <select className={selectClass} value={assignCameraId} onChange={e => setAssignCameraId(e.target.value)}>
                <option value="">Select…</option>
                {cameras.map(c => <option key={c.id} value={c.id}>{c.camera_name} (#{c.id})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">User</label>
              <select className={selectClass} value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                <option value="">Select…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username} (#{u.id})</option>)}
              </select>
            </div>
          </div>
          {assignError && <p className="text-sm text-red-400">{assignError}</p>}
          <button type="button" disabled={assigning} onClick={() => void handleAssign()} className="rounded-xl border border-border/50 bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50">
            {assigning ? "Assigning…" : "Assign Camera"}
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-border/50 bg-card shadow-md">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">Users</h2>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="pb-3 pr-3 font-medium">User</th>
                <th className="pb-3 pr-3 font-medium">Email</th>
                <th className="pb-3 pr-3 font-medium">Role</th>
                <th className="pb-3 pr-3 font-medium">Alerts</th>
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{u.username.charAt(0).toUpperCase()}</div>
                      <span className="font-medium text-foreground">{u.username}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="py-3 pr-3">{u.is_admin ? <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Admin</span> : <span className="text-muted-foreground text-xs">User</span>}</td>
                  <td className="py-3 pr-3">{u.email_notifications ? <span className="text-emerald-400 text-xs">On</span> : <span className="text-muted-foreground text-xs">Off</span>}</td>
                  <td className="py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(u)} className="rounded-lg border border-border/50 p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"><Edit className="size-3.5" /></button>
                      <button disabled={u.username === "admin" || u.id === currentUserId || deleteBusyId === u.id} onClick={() => void handleDelete(u)} className="rounded-lg border border-red-500/30 p-1.5 text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"><Trash2 className="size-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No users yet.</p>}
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingUser(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-border/30 px-6 py-4">
              <h3 className="text-sm font-semibold text-foreground">Edit User — {editingUser.username}</h3>
            </div>
            <div className="space-y-3 p-6">
              {editError && <p className="text-sm text-red-400">{editError}</p>}
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Username</label><input value={editUsername} onChange={e => setEditUsername(e.target.value)} className={selectClass} /></div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Email</label><input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className={selectClass} /></div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">Phone</label><input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} className={selectClass} /></div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground">New Password</label><input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Leave blank to keep" autoComplete="new-password" className={selectClass} /></div>
              <label className="flex items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors">
                <input type="checkbox" checked={editIsAdmin} onChange={e => setEditIsAdmin(e.target.checked)} disabled={editingUser.username === "admin"} className="size-4 rounded accent-primary" />
                <span className="text-sm">Administrator</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors">
                <input type="checkbox" checked={editMailAlerts} onChange={e => setEditMailAlerts(e.target.checked)} className="size-4 rounded accent-primary" />
                <span className="text-sm">Email alerts</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border/30 px-6 py-4">
              <button onClick={() => setEditingUser(null)} className="rounded-xl border border-border/50 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/30 transition-colors">Cancel</button>
              <button disabled={editSaving} onClick={() => void handleSaveEdit()} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50">{editSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cameras Table */}
      <div className="rounded-xl border border-border/50 bg-card shadow-md">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">Cameras</h2>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="pb-3 pr-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Assigned User</th>
              </tr>
            </thead>
            <tbody>
              {cameras.map(c => {
                const assignedUser = users.find(u => u.id === c.assigned_user_id);
                return (
                  <tr key={c.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 pr-3 font-medium text-foreground">{c.camera_name}</td>
                    <td className="py-3 text-muted-foreground">{assignedUser ? assignedUser.username : "Unassigned"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
