import { useMemo, useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import ProjectCard from "../components/portfolio/ProjectCard";
import { Search, SlidersHorizontal, X } from "lucide-react";

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "alphabetical", label: "A – Z" },
  { key: "recently_updated", label: "Recently updated" },
];

export default function Gallery({ mode }) {
  const params = useParams();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [sort, setSort] = useState(sp.get("sort") || "newest");
  const [featured, setFeatured] = useState(sp.get("featured") === "true");
  const [showFilters, setShowFilters] = useState(false);
  const [org, setOrg] = useState(mode === "organization" ? decodeURIComponent(params.name) : sp.get("organization") || "");
  const [cat, setCat] = useState(mode === "category" ? decodeURIComponent(params.name) : sp.get("category") || "");
  const [page, setPage] = useState(0);
  const limit = 24;

  useEffect(() => setPage(0), [q, sort, featured, org, cat]);

  const query = useQuery({
    queryKey: ["projects", { q, sort, featured, org, cat, page }],
    queryFn: () => api.get("/projects", {
      params: {
        q: q || undefined, sort, featured: featured || undefined,
        organization: org || undefined, category: cat || undefined,
        limit, skip: page * limit,
      },
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api.get("/projects/stats").then(r => r.data) });
  const items = query.data?.items || [];
  const total = query.data?.total || 0;

  const title = useMemo(() => {
    if (mode === "organization") return decodeURIComponent(params.name);
    if (mode === "category") return decodeURIComponent(params.name);
    return "Gallery";
  }, [mode, params.name]);

  const clearFilters = () => { setQ(""); setFeatured(false); setOrg(""); setCat(""); setSort("newest"); setSp({}); };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 fade-in">
      <div className="mb-8">
        <h1 className="heading-font text-4xl font-bold" style={{ color: "rgb(26, 26, 46)" }} data-testid="gallery-title">{title}</h1>
        <p className="text-gray-500 mt-2">{total} project{total !== 1 ? "s" : ""}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects..."
                 className="w-full pl-10 pr-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                 data-testid="search-input" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-4 py-2.5 rounded-full border border-gray-200 bg-white text-sm" data-testid="sort-select">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className={`filter-chip px-4 py-2 rounded-full text-sm border border-gray-200 ${featured ? "active" : ""}`}
                onClick={() => setFeatured(!featured)} data-testid="filter-featured">Featured</button>
        <button className="filter-chip px-4 py-2 rounded-full text-sm border border-gray-200 flex items-center gap-2"
                onClick={() => setShowFilters(!showFilters)} data-testid="filter-toggle">
          <SlidersHorizontal className="w-4 h-4" /> Filters
        </button>
        {(q || featured || org || cat) && (
          <button className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1" onClick={clearFilters}>
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {showFilters && (
        <div className="mb-8 p-5 bg-white rounded-2xl border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Organization</label>
            <select value={org} onChange={(e) => setOrg(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value="">All organizations</option>
              {stats?.by_organization?.map(o => <option key={o.name} value={o.name}>{o.name} ({o.count})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <option value="">All categories</option>
              {stats?.by_category?.map(o => <option key={o.name} value={o.name}>{o.name} ({o.count})</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Grid */}
      {query.isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400" data-testid="empty-state">
          <p className="text-lg font-medium text-gray-500">No projects yet</p>
          <p className="text-sm mt-2">Connect your Canva account from the admin dashboard to sync designs.</p>
        </div>
      ) : (
        <>
          <div className="masonry stagger" data-testid="gallery-grid">
            {items.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-center gap-3 mt-12">
              <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
                      className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm disabled:opacity-50">Previous</button>
              <span className="text-sm text-gray-500">Page {page + 1} of {Math.ceil(total / limit)}</span>
              <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}
                      className="px-4 py-2 rounded-full border border-gray-200 bg-white text-sm disabled:opacity-50">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
