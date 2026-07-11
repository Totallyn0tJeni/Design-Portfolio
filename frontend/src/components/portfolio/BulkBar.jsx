import { useState } from "react";
import { Trash2, Archive, CheckCircle, Tag, Building2, Layers, Star, X } from "lucide-react";

const ORGS = ["FIRST Robotics","Zebra Robotics","WolfHacks","Superposition Toronto","Founders Den","Brampton FBLC","Ching Scholars","STEM Organizations","Volunteer Work","School Projects","Personal Projects"];
const CATS = ["Branding","Logo","Poster","Flyer","Presentation","Certificate","Social Media","Photography","Marketing","Website","UI Design","App Design","Infographic","Banner","Merchandise","Print","Motion Graphics","Miscellaneous"];
const STATUSES = [
  { key: "needs_review", label: "Needs Review" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

export default function BulkBar({ count, onClear, onAction }) {
  const [modal, setModal] = useState(null);

  return (
    <>
      <div className="sticky top-16 z-30 mb-4 rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 text-white p-3 flex flex-wrap items-center gap-2 shadow-lg" data-testid="bulk-bar">
        <span className="font-medium px-3">{count} selected</span>
        <div className="h-6 w-px bg-white/20 mx-1" />
        <BarBtn onClick={() => setModal("status")}><CheckCircle className="w-4 h-4" /> Status</BarBtn>
        <BarBtn onClick={() => setModal("organization")}><Building2 className="w-4 h-4" /> Organization</BarBtn>
        <BarBtn onClick={() => setModal("category")}><Layers className="w-4 h-4" /> Category</BarBtn>
        <BarBtn onClick={() => setModal("tags")}><Tag className="w-4 h-4" /> Add tags</BarBtn>
        <BarBtn onClick={() => onAction({ action: "set_featured", value: true })}><Star className="w-4 h-4" /> Feature</BarBtn>
        <BarBtn onClick={() => onAction({ action: "archive" })}><Archive className="w-4 h-4" /> Archive</BarBtn>
        <BarBtn onClick={() => { if (window.confirm(`Delete ${count} projects permanently?`)) onAction({ action: "delete" }); }} tone="danger"><Trash2 className="w-4 h-4" /> Delete</BarBtn>
        <button onClick={onClear} className="ml-auto text-white/70 hover:text-white p-1.5" data-testid="bulk-clear"><X className="w-4 h-4" /></button>
      </div>

      {modal && <PickerModal title={`Bulk set ${modal}`} options={
        modal === "status" ? STATUSES : modal === "organization" ? ORGS.map(o => ({key: o, label: o})) : modal === "category" ? CATS.map(c => ({key: c, label: c})) : null
      } free={modal === "tags"} onClose={() => setModal(null)}
        onPick={(value) => {
          const map = { status: "set_status", organization: "set_organization", category: "set_category", tags: "add_tags" };
          onAction({ action: map[modal], value });
          setModal(null);
        }} />}
    </>
  );
}

function BarBtn({ children, onClick, tone }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 transition ${tone === "danger" ? "bg-red-500/30 hover:bg-red-500/50" : "bg-white/15 hover:bg-white/25"}`}>
      {children}
    </button>
  );
}

function PickerModal({ title, options, free, onPick, onClose }) {
  const [text, setText] = useState("");
  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading-font text-xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>{title}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        {free ? (
          <>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="tag1, tag2"
                   className="w-full px-4 py-2 rounded-full border border-gray-200 text-sm" data-testid="bulk-tags-input" />
            <button className="mt-4 w-full py-2.5 rounded-full text-white font-medium" style={{ background: "rgb(124, 58, 237)" }}
                    onClick={() => onPick(text.split(",").map(t => t.trim()).filter(Boolean))}>
              Add tags
            </button>
          </>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-1">
            {options.map((o) => (
              <button key={o.key} onClick={() => onPick(o.key)}
                      className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-purple-50 text-sm text-gray-700">
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
