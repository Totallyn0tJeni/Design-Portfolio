import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Upload, Trash2, ExternalLink, ImageOff, Loader2, FileText } from "lucide-react";

export default function MediaManager() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);

  const assets = useQuery({
    queryKey: ["assets", filter],
    queryFn: () => api.get("/assets", { params: { unused_only: filter === "unused" || undefined, limit: 200 } }).then(r => r.data),
  });

  const upload = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post("/assets/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => setProgress(Math.round((e.loaded / (e.total || 1)) * 100)),
      });
    },
    onSuccess: () => { setProgress(null); qc.invalidateQueries({ queryKey: ["assets"] }); },
    onError: () => setProgress(null),
  });

  const del = useMutation({
    mutationFn: (id) => api.delete(`/assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });

  const onFile = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => upload.mutate(f));
    e.target.value = "";
  };

  const items = assets.data?.items || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="heading-font text-xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Media library</h2>
          <p className="text-sm text-gray-500 mt-1">{assets.data?.total ?? 0} assets · uploads up to 1 GB per file</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilter("all")} className={`filter-chip px-4 py-2 rounded-full text-sm border border-gray-200 ${filter === "all" ? "active" : ""}`}>All</button>
          <button onClick={() => setFilter("unused")} className={`filter-chip px-4 py-2 rounded-full text-sm border border-gray-200 ${filter === "unused" ? "active" : ""}`}>Unused</button>
          <input ref={inputRef} type="file" hidden multiple onChange={onFile} accept="image/*,video/*,application/pdf" data-testid="media-upload-input" />
          <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white"
                  style={{ background: "rgb(124, 58, 237)" }} data-testid="upload-btn">
            {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
          </button>
        </div>
      </div>

      {progress != null && (
        <div className="mb-6 p-3 rounded-xl bg-purple-50 text-purple-800 text-sm flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Uploading… {progress}%
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl text-gray-400">
          <ImageOff className="w-8 h-8 mx-auto mb-2" />
          No assets yet. Upload individual files here — Canva remains your primary source.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((a) => (
            <div key={a.id} className="group rounded-2xl overflow-hidden border border-gray-100 bg-white" data-testid={`asset-${a.id}`}>
              <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                {a.content_type?.startsWith("image/") ? (
                  <img src={a.url} alt={a.filename} className="w-full h-full object-cover" loading="lazy" />
                ) : a.content_type === "application/pdf" ? (
                  <FileText className="w-8 h-8 text-gray-400" />
                ) : (
                  <span className="text-xs text-gray-400">{a.content_type}</span>
                )}
              </div>
              <div className="p-3 text-xs">
                <p className="font-medium text-gray-700 truncate">{a.filename}</p>
                <div className="flex items-center justify-between mt-1 text-gray-400">
                  <span>{(a.size / 1024).toFixed(0)} KB</span>
                  <div className="flex items-center gap-2">
                    <a href={a.url} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 hover:text-purple-600" /></a>
                    <button onClick={() => { if (window.confirm("Delete this asset?")) del.mutate(a.id); }}><Trash2 className="w-3.5 h-3.5 hover:text-red-600" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
