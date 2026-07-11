import { Link } from "react-router-dom";
import LazyImage from "./LazyImage";

export default function ProjectCard({ project, aspect }) {
  const ratios = ["1/1", "4/5", "16/9", "3/4", "4/3", "3/2", "2/3", "16/10"];
  const chosen = aspect || ratios[Math.abs((project.id || "").length) % ratios.length];
  return (
    <Link to={`/project/${project.slug || project.id}`}
          className="project-card block rounded-2xl overflow-hidden border border-gray-100 bg-white"
          data-testid={`project-card-${project.id}`}>
      <div className="relative">
        <LazyImage src={project.thumbnail} alt={project.title} aspectRatio={chosen} testid={`project-img-${project.id}`} />
        <div className="card-overlay absolute inset-0 bg-black/40 flex items-center justify-center">
          <span className="text-white font-medium text-sm">View Project</span>
        </div>
        {project.featured && (
          <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
                style={{ background: "white", color: "rgb(124, 58, 237)" }}>
            Featured
          </span>
        )}
      </div>
      <div className="p-4">
        <h4 className="canva-text font-medium text-gray-800 truncate">{project.title}</h4>
        {project.description ? (
          <p className="canva-text text-sm mt-1 text-gray-500 line-clamp-2">{project.description}</p>
        ) : (
          <p className="canva-text text-sm mt-1 text-gray-400">{project.category || "—"}</p>
        )}
        <p className="canva-text text-xs mt-2 text-gray-400">
          {project.organization || project.category || "Design"} • Canva
        </p>
      </div>
    </Link>
  );
}
