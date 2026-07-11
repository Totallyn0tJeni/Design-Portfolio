import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import {
  RefreshCw, Plug, LogOut, AlertTriangle, CheckCircle2, Circle, Sparkles, Trash2, Edit3, X, ExternalLink,
} from "lucide-react";

export default function Admin() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

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
    queryKey: ["admin-projects"],
    queryFn: () => api.get("/projects", { params: { limit: 200, include_hidden: true } }).then(r => r.data),
    enabled: !!user,
  });
  const allow = useQuery({ queryKey: ["allowlist"], queryFn: () => api.get("/admin/allowlist").then(r => r.data), enabled: !!user });
  const logs = useQuery({ queryKey: ["logs"], queryFn: () => api.get("/sync/logs").then(r => r.data), enabled: !!user });

  const connect = useMutation({
    mutationFn: () => api.get("/canva/connect").then(r => r.data),
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e) => setBanner({ type: "err", msg: e?.response?.data?.detail || "Connect failed" }),
  });
  const sync = useMutation({
    mutationFn: (canva_user_id) => api.post("/canva/sync", canva_user_id ? { canva_user_id } : {}).then(r => r.data),
    onSuccess: (d) => {
      setBanner({ type: "ok", msg: `Sync complete: +${d.created} created, ${d.updated} updated, ${d.deleted} archived.` });
      qc.invalidateQueries();
    },
    onError: (e) => setBanner({ type: "err", msg: e?.response?.data?.detail || "Sync failed" }),
  });
  const disconnect = useMutation({
    mutationFn: (id) => api.delete(`/canva/accounts/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(),
  });
  const updateProj = useMutation({
    mutationFn: ({ id, data }) => api.put(`/projects/${id}`, data).then(r => r.data),
    onSuccess: () => { setEditing(null); qc.invalidateQueries(); },
  });
  const reclassify = useMutation({
    mutationFn: (id) => api.post(`/ai/classify/${id}`).then(r => r.data),
    onSuccess: () => { setBanner({ type: "ok", msg: "Reclassified via AI." }); qc.invalidateQueries(); },
  });
  const addAllow = useMutation({
    mutationFn: (email) => api.post("/admin/allowlist", { email, role: "editor" }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["allowlist"] }),
  });
  const rmAllow = useMutation({
    mutationFn: (email) => api.delete(`/admin/allowlist/${encodeURIComponent(email)}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["allowlist"] }),
  });

  if (loading || !user) return <div className="max-w-6xl mx-auto px-6 py-20 text-gray-400">Loading…</div>;
  const t = dash.data?.totals || {};
  const configured = dash.data?.canva_configured;
  const accounts = dash.data?.canva_accounts || [];

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="heading-font text-4xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Signed in as <span className="font-medium">{user.email}</span></p>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1" data-testid="logout-btn">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <Stat label="Total projects" value={t.projects ?? 0} />
        <Stat label="Featured" value={t.featured ?? 0} />
        <Stat label="Uncategorized" value={t.uncategorized ?? 0} accent={t.uncategorized > 0} />
        <Stat label="Drafts" value={t.needing_review ?? 0} />
        <Stat label="Archived" value={t.archived ?? 0} />
      </div>

      {/* Canva accounts */}
      <Section title="Canva Accounts" action={
        <button onClick={() => connect.mutate()} disabled={!configured}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "rgb(124, 58, 237)" }} data-testid="connect-canva-btn">
          <Plug className="w-4 h-4" /> Connect new account
        </button>
      }>
        {!configured && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 mb-4">
            Canva integration not configured. Set <code className="font-mono">CANVA_CLIENT_ID</code>, <code className="font-mono">CANVA_CLIENT_SECRET</code>,
            <code className="font-mono"> CANVA_REDIRECT_URI</code>, and <code className="font-mono">FRONTEND_URL</code> in <code className="font-mono">/app/backend/.env</code>, then restart backend.
          </div>
        )}
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">No Canva accounts connected yet.</p>
        ) : (
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-gray-200 hover:border-purple-400"
                          data-testid={`sync-${a.canva_user_id}`}>
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
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600 hover:border-purple-400 hover:text-purple-700"
                    data-testid="sync-all-btn">
              <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} />
              Sync all accounts
            </button>
          </div>
        )}
      </Section>

      {/* Admin allowlist */}
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
          <input name="email" type="email" placeholder="email@example.com"
                 className="flex-1 px-4 py-2 rounded-full border border-gray-200 text-sm" />
          <button className="px-4 py-2 rounded-full text-sm font-medium text-white" style={{ background: "rgb(124, 58, 237)" }}>Add</button>
        </form>
      </Section>

      {/* Recent sync logs */}
      <Section title="Recent syncs">
        {(logs.data?.items || []).length === 0 ? <p className="text-sm text-gray-500">No syncs yet.</p> : (
          <div className="space-y-2">
            {(logs.data?.items || []).slice(0, 5).map((l) => (
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

      {/* Projects table */}
      <Section title={`Projects (${projs.data?.total ?? 0})`}>
        {(projs.data?.items || []).length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet. Connect a Canva account and click Sync to import.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Organization</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(projs.data?.items || []).slice(0, 100).map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.thumbnail && <img src={p.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" loading="lazy" />}
                        <div className="truncate max-w-xs">
                          <p className="font-medium text-gray-800 truncate">{p.title}</p>
                          <p className="text-xs text-gray-400">{p.provider}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.organization || <span className="text-amber-600">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{p.category || <span className="text-amber-600">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.featured && <span className="chip">Featured</span>}
                        {p.hidden && <span className="chip" style={{ background: "#fee2e2", color: "#991b1b" }}>Hidden</span>}
                        {p.draft && <span className="chip" style={{ background: "#fef3c7", color: "#92400e" }}>Draft</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => reclassify.mutate(p.id)} title="Reclassify with AI"
                                className="text-purple-600 hover:text-purple-800">
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditing(p)} className="text-gray-500 hover:text-gray-800" title="Edit">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {p.canva_url && <a href={p.canva_url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-purple-600"><ExternalLink className="w-4 h-4" /></a>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {editing && <EditModal project={editing} onClose={() => setEditing(null)} onSave={(data) => updateProj.mutate({ id: editing.id, data })} />}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`rounded-2xl p-5 border ${accent ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-white"}`}>
      <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className="text-3xl font-bold mt-2" style={{ color: "rgb(26, 26, 46)" }}>{value}</p>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="heading-font text-xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const ORGS = ["FIRST Robotics","Zebra Robotics","WolfHacks","Superposition Toronto","Founders Den","Brampton FBLC","Ching Scholars","STEM Organizations","Volunteer Work","School Projects","Personal Projects"];
const CATS = ["Branding","Logo","Poster","Flyer","Presentation","Certificate","Social Media","Photography","Marketing","Website","UI Design","App Design","Infographic","Banner","Merchandise","Print","Motion Graphics","Miscellaneous"];

function EditModal({ project, onClose, onSave }) {
  const [f, setF] = useState({
    title: project.title || "",
    description: project.description || "",
    organization: project.organization || "",
    category: project.category || "",
    tags: (project.tags || []).join(", "),
    featured: !!project.featured, hidden: !!project.hidden, draft: !!project.draft, archived: !!project.archived,
  });
  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...f,
      tags: f.tags.split(",").map(x => x.trim()).filter(Boolean),
    });
  };
  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
            className="bg-white rounded-3xl p-8 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="heading-font text-xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Edit project</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input" /></Field>
          <Field label="Description"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="input" rows={3} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Organization">
              <select value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} className="input">
                <option value="">—</option>
                {ORGS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="input">
                <option value="">—</option>
                {CATS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Tags (comma-separated)"><input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {["featured", "hidden", "draft", "archived"].map((k) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
                <span className="capitalize">{k}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border border-gray-200 text-sm">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-full text-white text-sm font-medium" style={{ background: "rgb(124, 58, 237)" }} data-testid="save-project-btn">Save</button>
        </div>
        <style>{`.input { width: 100%; padding: 8px 12px; border-radius: 12px; border: 1px solid #e5e7eb; font-size: 14px; }`}</style>
      </form>
    </div>
  );
}
