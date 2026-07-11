import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Sparkles, Wand2, X, Check, FileText, Loader2 } from "lucide-react";

const ORGS = ["FIRST Robotics","Zebra Robotics","WolfHacks","Superposition Toronto","Founders Den","Brampton FBLC","Ching Scholars","STEM Organizations","Volunteer Work","School Projects","Personal Projects"];
const CATS = ["Branding","Logo","Poster","Flyer","Presentation","Certificate","Social Media","Photography","Marketing","Website","UI Design","App Design","Infographic","Banner","Merchandise","Print","Motion Graphics","Miscellaneous"];
const STATUSES = ["needs_review", "draft", "published", "archived"];

export default function ProjectEditor({ project, onClose, onSaved }) {
  const [f, setF] = useState({
    title: project.title || "", description: project.description || "",
    organization: project.organization || "", category: project.category || "",
    project_type: project.project_type || "",
    tags: (project.tags || []).join(", "),
    skills: (project.skills || []).join(", "),
    tools_used: (project.tools_used || []).join(", "),
    role: project.role || "",
    status: project.status || "needs_review",
    featured: !!project.featured, hidden: !!project.hidden,
    case_study: project.case_study || { challenge: "", goal: "", process: "", outcome: "", impact: "", timeline: "" },
  });
  const [suggestions, setSuggestions] = useState(project.ai_suggestions || null);
  const [tab, setTab] = useState("basics");

  const save = useMutation({
    mutationFn: () => api.put(`/projects/${project.id}`, {
      ...f,
      tags: f.tags.split(",").map(x => x.trim()).filter(Boolean),
      skills: f.skills.split(",").map(x => x.trim()).filter(Boolean),
      tools_used: f.tools_used.split(",").map(x => x.trim()).filter(Boolean),
    }),
    onSuccess: onSaved,
  });
  const suggest = useMutation({
    mutationFn: () => api.post(`/ai/suggest/${project.id}`).then(r => r.data),
    onSuccess: (d) => setSuggestions(d.suggestions),
  });
  const improveDesc = useMutation({
    mutationFn: () => api.post(`/ai/improve-description/${project.id}`).then(r => r.data),
    onSuccess: (d) => setF(v => ({ ...v, description: d.description })),
  });
  const caseStudy = useMutation({
    mutationFn: () => api.post(`/ai/case-study/${project.id}`).then(r => r.data),
    onSuccess: (d) => setF(v => ({ ...v, case_study: { ...v.case_study, ...d.case_study } })),
  });

  const applySuggestion = (field) => {
    if (!suggestions || suggestions[field] == null) return;
    const value = suggestions[field];
    if (field === "tags" || field === "skills" || field === "tools_used") {
      setF(v => ({ ...v, [field]: (value || []).join(", ") }));
    } else {
      setF(v => ({ ...v, [field]: value }));
    }
  };

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Edit project</p>
            <h3 className="heading-font text-2xl font-bold truncate max-w-md" style={{ color: "rgb(26, 26, 46)" }}>{f.title || "Untitled"}</h3>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-1 border-b border-gray-100 px-5">
          {["basics", "case_study", "ai"].map(t => (
            <button key={t} onClick={() => setTab(t)} data-testid={`editor-tab-${t}`}
                    className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${tab === t ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-900"}`}>
              {t === "basics" ? "Basics" : t === "case_study" ? "Case Study" : "AI Suggestions"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "basics" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Title" full><input className="input" value={f.title} onChange={(e) => setF({...f, title: e.target.value})} data-testid="edit-title" /></Field>
              <Field label="Status">
                <select className="input" value={f.status} onChange={(e) => setF({...f, status: e.target.value})} data-testid="edit-status">
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </Field>
              <Field label="Organization">
                <select className="input" value={f.organization} onChange={(e) => setF({...f, organization: e.target.value})}>
                  <option value="">—</option>
                  {ORGS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select className="input" value={f.category} onChange={(e) => setF({...f, category: e.target.value})}>
                  <option value="">—</option>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Project type"><input className="input" value={f.project_type} onChange={(e) => setF({...f, project_type: e.target.value})} /></Field>
              <Field label="Role"><input className="input" value={f.role} onChange={(e) => setF({...f, role: e.target.value})} placeholder="e.g. Lead Designer" /></Field>
              <Field label="Description" full action={
                <button onClick={() => improveDesc.mutate()} disabled={improveDesc.isPending} className="text-xs font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1" data-testid="improve-desc">
                  {improveDesc.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Improve
                </button>
              }>
                <textarea rows={3} className="input" value={f.description} onChange={(e) => setF({...f, description: e.target.value})} />
              </Field>
              <Field label="Tags (comma-separated)" full><input className="input" value={f.tags} onChange={(e) => setF({...f, tags: e.target.value})} /></Field>
              <Field label="Skills demonstrated (comma-separated)"><input className="input" value={f.skills} onChange={(e) => setF({...f, skills: e.target.value})} placeholder="Brand Identity, Layout" /></Field>
              <Field label="Tools (comma-separated)"><input className="input" value={f.tools_used} onChange={(e) => setF({...f, tools_used: e.target.value})} placeholder="Canva, Figma" /></Field>
              <div className="md:col-span-2 flex flex-wrap gap-4 pt-2">
                {["featured","hidden"].map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={f[k]} onChange={(e) => setF({...f, [k]: e.target.checked})} />
                    <span className="capitalize">{k}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === "case_study" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Add narrative context for portfolio storytelling. Optional — shown publicly only when filled.</p>
                <button onClick={() => caseStudy.mutate()} disabled={caseStudy.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white"
                        style={{ background: "rgb(124, 58, 237)" }} data-testid="generate-case-study">
                  {caseStudy.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Generate with AI
                </button>
              </div>
              {["challenge","goal","process","outcome","impact","timeline"].map(k => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)} full>
                  <textarea rows={k === "timeline" ? 1 : 2} className="input" value={f.case_study[k] || ""}
                            onChange={(e) => setF({...f, case_study: {...f.case_study, [k]: e.target.value}})} />
                </Field>
              ))}
            </div>
          )}

          {tab === "ai" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">AI-generated suggestions. Nothing applies until you accept it.</p>
                <button onClick={() => suggest.mutate()} disabled={suggest.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white"
                        style={{ background: "rgb(124, 58, 237)" }} data-testid="generate-ai">
                  {suggest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate suggestions
                </button>
              </div>
              {!suggestions ? (
                <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                  Click "Generate suggestions" to get AI recommendations.
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestions.reasoning && <p className="text-sm italic text-gray-500">{suggestions.reasoning}</p>}
                  <Suggestion label="Title" value={suggestions.title} onApply={() => applySuggestion("title")} />
                  <Suggestion label="Description" value={suggestions.description} onApply={() => applySuggestion("description")} multiline />
                  <Suggestion label="Organization" value={suggestions.organization}
                              confidence={suggestions.confidence?.organization} onApply={() => applySuggestion("organization")} />
                  <Suggestion label="Category" value={suggestions.category}
                              confidence={suggestions.confidence?.category} onApply={() => applySuggestion("category")} />
                  <Suggestion label="Tags" value={(suggestions.tags || []).join(", ")} onApply={() => applySuggestion("tags")} />
                  <Suggestion label="Skills" value={(suggestions.skills || []).join(", ")} onApply={() => applySuggestion("skills")} />
                  <Suggestion label="Tools" value={(suggestions.tools_used || []).join(", ")} onApply={() => applySuggestion("tools_used")} />
                  <Suggestion label="Featured" value={suggestions.featured ? "Yes" : "No"} onApply={() => applySuggestion("featured")} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-5 flex justify-end gap-2 bg-gray-50">
          <button onClick={onClose} className="px-5 py-2 rounded-full border border-gray-200 bg-white text-sm">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="px-5 py-2 rounded-full text-white text-sm font-medium disabled:opacity-60"
                  style={{ background: "rgb(124, 58, 237)" }} data-testid="save-project-btn">
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
        <style>{`.input { width: 100%; padding: 8px 12px; border-radius: 12px; border: 1px solid #e5e7eb; font-size: 14px; background: white; }
                 .input:focus { outline: none; border-color: rgb(124,58,237); box-shadow: 0 0 0 3px rgba(124,58,237,0.15); }`}</style>
      </div>
    </div>
  );
}

function Field({ label, children, full, action }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function Suggestion({ label, value, confidence, onApply, multiline }) {
  if (value == null || value === "") return null;
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  return (
    <div className="p-4 rounded-2xl border border-gray-100 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">{label}</span>
          {pct != null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pct >= 80 ? "bg-green-100 text-green-800" : pct >= 50 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>
              {pct}% confidence
            </span>
          )}
        </div>
        <button onClick={onApply} className="text-xs font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1">
          <Check className="w-3 h-3" /> Apply
        </button>
      </div>
      <p className={`text-sm text-gray-800 ${multiline ? "" : "truncate"}`}>{String(value)}</p>
    </div>
  );
}
