import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import LazyImage from "../components/portfolio/LazyImage";
import { ArrowLeft, ExternalLink, Share2, Calendar, User, Tag } from "lucide-react";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data),
  });

  if (isLoading) return <div className="max-w-6xl mx-auto px-6 py-16 text-center text-gray-400">Loading…</div>;
  if (!data?.project) return <div className="max-w-6xl mx-auto px-6 py-16 text-center text-gray-400">Project not found</div>;

  const p = data.project;
  const related = data.related || [];
  const meta = (p.created_at || "").slice(0, 10);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: p.title, url }); } catch {}
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 fade-in">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-6" data-testid="back-btn">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        <div className="lg:col-span-3">
          <div className="rounded-2xl overflow-hidden bg-white border border-gray-100" data-testid="project-hero">
            <LazyImage src={p.thumbnail} alt={p.title} aspectRatio="16/10" />
          </div>
          {p.preview_images?.length > 1 && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {p.preview_images.slice(1, 7).map((img, i) => (
                <div key={i} className="rounded-xl overflow-hidden bg-white border border-gray-100">
                  <LazyImage src={img} alt={`${p.title} ${i + 2}`} aspectRatio="1/1" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {p.category && <p className="text-xs uppercase font-semibold tracking-wider mb-3" style={{ color: "rgb(124, 58, 237)" }}>{p.category}</p>}
          <h1 className="heading-font text-3xl font-bold" style={{ color: "rgb(26, 26, 46)" }} data-testid="project-title">{p.title}</h1>
          {p.description && <p className="text-gray-600 mt-4 leading-relaxed">{p.description}</p>}

          <div className="mt-8 space-y-4 text-sm">
            {p.organization && <Row icon={<User className="w-4 h-4" />} label="Organization" value={p.organization} />}
            {p.role && <Row icon={<User className="w-4 h-4" />} label="Role" value={p.role} />}
            {meta && <Row icon={<Calendar className="w-4 h-4" />} label="Created" value={meta} />}
            {p.dimensions && <Row label="Dimensions" value={typeof p.dimensions === "object" ? `${p.dimensions.width || ""}×${p.dimensions.height || ""}` : String(p.dimensions)} />}
            {p.tools_used?.length > 0 && <Row label="Tools" value={p.tools_used.join(", ")} />}
            {p.source_account?.display_name && <Row label="Source" value={`Canva · ${p.source_account.display_name}`} />}
          </div>

          {p.tags?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {p.tags.map((t) => <span key={t} className="chip"><Tag className="w-3 h-3" /> {t}</span>)}
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {p.canva_url && (
              <a href={p.canva_url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white"
                 style={{ background: "rgb(124, 58, 237)" }} data-testid="open-in-canva">
                <ExternalLink className="w-4 h-4" /> Open in Canva
              </a>
            )}
            {p.view_url && (
              <a href={p.view_url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium border border-gray-200 bg-white">
                <ExternalLink className="w-4 h-4" /> View publish URL
              </a>
            )}
            <button onClick={share} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium border border-gray-200 bg-white" data-testid="share-btn">
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="heading-font text-2xl font-bold mb-6" style={{ color: "rgb(26, 26, 46)" }}>Related work</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 stagger">
            {related.map((r) => (
              <Link key={r.id} to={`/project/${r.slug || r.id}`}
                    className="project-card rounded-2xl overflow-hidden border border-gray-100 bg-white block">
                <LazyImage src={r.thumbnail} alt={r.title} aspectRatio="4/3" />
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{r.organization || r.category}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <span className="text-gray-400 mt-0.5">{icon}</span>}
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-400 font-medium">{label}</p>
        <p className="text-gray-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
