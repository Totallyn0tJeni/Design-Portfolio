import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import {
  RefreshCw, Plug, LogOut, AlertTriangle, CheckCircle2, Sparkles, Trash2, Edit3, X, ExternalLink,
  Layers, Image as ImageIcon, Users, Search, Filter, ArrowUp, ArrowDown, Upload, Eye, Wand2,
} from "lucide-react";
import ProjectEditor from "../components/portfolio/ProjectEditor";
import MediaManager from "../components/portfolio/MediaManager";
import BulkBar from "../components/portfolio/BulkBar";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs Review" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

const TAB_ITEMS = [
  { key: "projects", label: "Projects", Icon: Layers },
  { key: "media", label: "Media", Icon: ImageIcon },
  { key: "canva", label: "Canva & Sync", Icon: Plug },
  { key: "team", label: "Team Access", Icon: Users },
];

export default function Admin() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState("projects");
  const [statusTab, setStatusTab] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => { if (!loading && !user) navigate("/login", { replace: true }); }, [loading, user, navigate]);
  useEffect(() => {
    const c = sp.get("canva");
    if (c === "connected") setBanner({ type: "ok", msg: "Canva account connected." });
    else if (c === "error") setBanner({ type: "err", msg: "Canva connection failed." });
    else if (c === "token_failed") setBanner({ type: "err", msg: "Canva token exchange failed. Check credentials." });
    else if (c === "invalid_state") setBanner({ type: "err", msg: "Invalid OAuth state." });
    if (c) setSp({});
  }, [sp, setSp]);

  const dash = useQuery({ queryKey: ["dash"], queryFn: () => api.get("/admin/dashboard").then(r => r.data), enabled: !!user });
  const projs = useQuery({
    queryKey: ["admin-projects", statusTab, q],
    queryFn: () => api.get("/projects", { params: {
      status: statusTab === "all" ? undefined : statusTab,
      q: q || undefined, limit: 300, include_hidden: true, sort: "recently_updated",
    }}).then(r => r.data),
    enabled: !!user,
  });
  const logs = useQuery({ queryKey: ["logs"], queryFn: () => api.get("/sync/logs").then(r => r.data), enabled: !!user });
  const allow = useQuery({ queryKey: ["allowlist"], queryFn: () => api.get("/admin/allowlist").then(r => r.data), enabled: !!user });

  const bulk = useMutation({
    mutationFn: (payload) => api.post("/projects/bulk", payload).then(r => r.data),
    onSuccess: () => { setSelected(new Set()); qc.invalidateQueries(); setBanner({ type: "ok", msg: "Bulk action complete." }); },
  });
  const connect = useMutation({
    mutationFn: () => api.get("/canva/connect").then(r => r.data),
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e) => setBanner({ type: "err", msg: e?.response?.data?.detail || "Connect failed" }),
  });
  const sync = useMutation({
    mutationFn: (canva_user_id) => api.post("/canva/sync", canva_user_id ? { canva_user_id } : {}).then(r => r.data),
    onSuccess: (d) => { setBanner({ type: "ok", msg: `Sync complete: +${d.created} created, ${d.updated} updated, ${d.deleted} archived.` }); qc.invalidateQueries(); },
    onError: (e) => setBanner({ type: "err", msg: e?.response?.data?.detail || "Sync failed" }),
  });
  const disconnect = useMutation({ mutationFn: (id) => api.delete(`/canva/accounts/${id}`), onSuccess: () => qc.invalidateQueries() });
  const addAllow = useMutation({ mutationFn: (email) => api.post("/admin/allowlist", { email, role: "editor" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["allowlist"] }) });
  const rmAllow = useMutation({ mutationFn: (email) => api.delete(`/admin/allowlist/${encodeURIComponent(email)}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["allowlist"] }) });
  const reorderMut = useMutation({
    mutationFn: (value) => api.post("/projects/bulk", { ids: value.map(v => v.id), action: "reorder", value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-projects"] }),
  });

  const items = projs.data?.items || [];
  const allSelected = items.length > 0 && items.every(p => selected.has(p.id));

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(p => p.id)));
  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const moveOrder = (idx, dir) => {
    const list = [...items];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    reorderMut.mutate(list.map((p, i) => ({ id: p.id, order: i })));
  };

  if (loading || !user) return <div className="max-w-6xl mx-auto px-6 py-20 text-gray-400">Loading…</div>;
  const t = dash.data?.totals || {};
  const configured = dash.data?.canva_configured;
  const accounts = dash.data?.canva_accounts || [];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-gray-400">Portfolio CMS</p>
          <h1 className="heading-font text-4xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Dashboard</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{user.email}</span>
          <button onClick={logout} className="text-gray-500 hover:text-gray-800 flex items-center gap-1" data-testid="logout-btn">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>

      {banner && (
        <div className={`mb-6 rounded-2xl px-5 py-3 text-sm flex items-center justify-between ${banner.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          <span className="flex items-center gap-2">
            {banner.type === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {banner.msg}
          </span>
          <button onClick={() => setBanner(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8">
        <Stat label="Total" value={t.projects ?? 0} />
        <Stat label="Published" value={t.published ?? 0} tone="green" />
        <Stat label="Needs review" value={t.needing_review ?? 0} tone="amber" />
        <Stat label="Featured" value={t.featured ?? 0} tone="purple" />
        <Stat label="Uncategorized" value={t.uncategorized ?? 0} tone={t.uncategorized > 0 ? "amber" : "gray"} />
        <Stat label="Assets" value={t.assets ?? 0} />
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-full p-1 mb-8 w-fit">
        {TAB_ITEMS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} data-testid={`tab-${key}`}
                  className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition ${tab === key ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
                  style={tab === key ? { background: "rgb(124, 58, 237)" } : {}}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "projects" && (
        <>
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {STATUS_TABS.map(s => (
              <button key={s.key} onClick={() => { setStatusTab(s.key); setSelected(new Set()); }} data-testid={`status-tab-${s.key}`}
                      className={`filter-chip px-4 py-2 rounded-full text-sm border border-gray-200 ${statusTab === s.key ? "active" : ""}`}>
                {s.label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…"
                     className="pl-10 pr-4 py-2 rounded-full border border-gray-200 bg-white text-sm w-72" data-testid="admin-search" />
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}
                     onAction={(payload) => bulk.mutate({ ...payload, ids: [...selected] })} />
          )}

          {/* Projects table */}
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="select-all" />
                  </th>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Organization</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !projs.isLoading && (
                  <tr><td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                    No projects yet. Connect a Canva account and click Sync to import.
                  </td></tr>
                )}
                {items.map((p, idx) => {
                  const isSel = selected.has(p.id);
                  const status = p.status || (p.draft ? "draft" : (p.archived ? "archived" : "published"));
                  return (
                    <tr key={p.id} className={`border-t border-gray-100 hover:bg-purple-50/30 ${isSel ? "bg-purple-50/60" : ""}`} data-testid={`project-row-${p.id}`}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={isSel} onChange={() => toggle(p.id)} data-testid={`select-${p.id}`} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.thumbnail && <img src={p.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" loading="lazy" />}
                          <div className="truncate max-w-xs">
                            <p className="font-medium text-gray-800 truncate">{p.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{p.provider} · {p.source_account?.display_name || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.organization || <span className="text-amber-600">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{p.category || <span className="text-amber-600">—</span>}</td>
                      <td className="px-4 py-3"><StatusChip status={status} featured={p.featured} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <IconBtn title="Preview" onClick={() => setPreview(p)} testid={`preview-${p.id}`}><Eye className="w-4 h-4" /></IconBtn>
                          <IconBtn title="Move up" onClick={() => moveOrder(idx, -1)}><ArrowUp className="w-4 h-4" /></IconBtn>
                          <IconBtn title="Move down" onClick={() => moveOrder(idx, 1)}><ArrowDown className="w-4 h-4" /></IconBtn>
                          <IconBtn title="Edit / AI" onClick={() => setEditing(p)} testid={`edit-${p.id}`}><Edit3 className="w-4 h-4" /></IconBtn>
                          {p.canva_url && <a href={p.canva_url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-purple-600 p-1.5"><ExternalLink className="w-4 h-4" /></a>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "media" && <MediaManager />}

      {tab === "canva" && (
        <div className="space-y-6">
          <Section title="Canva Accounts" action={
            <button onClick={() => connect.mutate()} disabled={!configured}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "rgb(124, 58, 237)" }} data-testid="connect-canva-btn">
              <Plug className="w-4 h-4" /> Connect account
            </button>
          }>
            {!configured && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 mb-4">
                Canva integration not configured. Set <code>CANVA_CLIENT_ID</code>, <code>CANVA_CLIENT_SECRET</code>,
                <code> CANVA_REDIRECT_URI</code>, <code>FRONTEND_URL</code> in <code>/app/backend/.env</code>, then restart backend.
              </div>
            )}
            {accounts.length === 0 ? <p className="text-sm text-gray-500">No Canva accounts connected yet.</p> : (
              <div className="space-y-3">
                {accounts.map((a) => (
                  <div key={a.canva_user_id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white">
                    <div>
                      <p className="font-medium text-gray-800">{a.display_name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Last sync: {a.last_sync ? new Date(a.last_sync).toLocaleString() : "never"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => sync.mutate(a.canva_user_id)} disabled={sync.isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-gray-200 hover:border-purple-400" data-testid={`sync-${a.canva_user_id}`}>
                        <RefreshCw className={`w-3.5 h-3.5 ${sync.isPending ? "animate-spin" : ""}`} /> Sync
                      </button>
                      <button onClick={() => disconnect.mutate(a.canva_user_id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-gray-200 hover:border-red-400 text-red-600">
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => sync.mutate(null)} disabled={sync.isPending}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600 hover:border-purple-400 hover:text-purple-700" data-testid="sync-all-btn">
                  <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} /> Sync all accounts
                </button>
              </div>
            )}
          </Section>

          <Section title="Recent syncs">
            {(logs.data?.items || []).length === 0 ? <p className="text-sm text-gray-500">No syncs yet.</p> : (
              <div className="space-y-2">
                {(logs.data?.items || []).slice(0, 8).map((l) => (
                  <div key={l.id} className="p-3 rounded-xl border border-gray-100 bg-white text-sm flex items-center justify-between">
                    <span>
                      <span className="font-medium">{l.status}</span> —
                      +{l.created} · ~{l.updated} · ⌫{l.deleted}
                      {(l.errors || []).length > 0 && <span className="text-red-600 ml-2">{l.errors.length} error(s)</span>}
                    </span>
                    <span className="text-xs text-gray-400">{l.started_at ? new Date(l.started_at).toLocaleString() : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === "team" && (
        <Section title="Admin Allowlist">
          <div className="space-y-2 mb-4">
            {(allow.data?.items || []).map((a) => (
              <div key={a.email} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white text-sm">
                <div><span className="font-medium">{a.email}</span> <span className="text-xs text-gray-400 ml-2">{a.role}</span></div>
                <button onClick={() => rmAllow.mutate(a.email)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const em = e.target.email.value.trim(); if (em) { addAllow.mutate(em); e.target.reset(); } }}
                className="flex gap-2" data-testid="allowlist-form">
            <input name="email" type="email" placeholder="email@example.com" className="flex-1 px-4 py-2 rounded-full border border-gray-200 text-sm" />
            <button className="px-4 py-2 rounded-full text-sm font-medium text-white" style={{ background: "rgb(124, 58, 237)" }}>Add</button>
          </form>
        </Section>
      )}

      {editing && <ProjectEditor project={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries(); }} />}
      {preview && <QuickPreview project={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const toneCls = { green: "border-green-200 bg-green-50", amber: "border-amber-200 bg-amber-50", purple: "border-purple-200 bg-purple-50" }[tone] || "border-gray-100 bg-white";
  return (
    <div className={`rounded-2xl p-4 border ${toneCls}`}>
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1.5" style={{ color: "rgb(26, 26, 46)" }}>{value}</p>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="heading-font text-xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function IconBtn({ children, onClick, title, testid }) {
  return (
    <button onClick={onClick} title={title} data-testid={testid} className="text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg p-1.5 transition">
      {children}
    </button>
  );
}

function StatusChip({ status, featured }) {
  const colors = {
    published: { bg: "#dcfce7", fg: "#166534" },
    needs_review: { bg: "#fef3c7", fg: "#92400e" },
    draft: { bg: "#e0e7ff", fg: "#3730a3" },
    imported: { bg: "#f3f4f6", fg: "#374151" },
    archived: { bg: "#fee2e2", fg: "#991b1b" },
  };
  const c = colors[status] || colors.imported;
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: c.bg, color: c.fg }}>
        {status.replace("_", " ")}
      </span>
      {featured && <span className="chip">Featured</span>}
    </div>
  );
}

function QuickPreview({ project, onClose }) {
  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="heading-font text-xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>{project.title}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        {project.thumbnail && <img src={project.thumbnail} alt="" className="w-full max-h-[60vh] object-contain bg-gray-50" />}
        <div className="p-5 space-y-3 text-sm text-gray-700">
          <p className="text-gray-500">{project.description || "No description yet."}</p>
          <div className="flex flex-wrap gap-2">
            {(project.tags || []).map(t => <span key={t} className="chip">{t}</span>)}
          </div>
          <p className="text-xs text-gray-400">
            {project.organization} · {project.category} · {project.status || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
