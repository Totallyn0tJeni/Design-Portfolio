import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import ProjectCard from "../components/portfolio/ProjectCard";
import {
  Cpu, Bot, Code2, Sparkles, Rocket, Briefcase, GraduationCap,
  FlaskConical, Heart, BookOpen, Palette, PenTool, Layout as LayoutIcon, Shapes, Mail, ArrowRight,
} from "lucide-react";

const CATS = [
  { key: "FIRST Robotics", desc: "Competition graphics, branding, outreach materials, photography, certificates, presentations.", Icon: Cpu, bg: "bg-purple-100", fg: "text-purple-600" },
  { key: "Zebra Robotics", desc: "Marketing campaigns, social media content, promotional graphics, photography, event materials.", Icon: Bot, bg: "bg-violet-100", fg: "text-violet-600" },
  { key: "WolfHacks", desc: "Hackathon branding, posters, banners, social media, website design, certificates, signage.", Icon: Code2, bg: "bg-indigo-100", fg: "text-indigo-600" },
  { key: "Superposition Toronto", desc: "Communications strategy, social media graphics, outreach campaigns, brand materials.", Icon: Sparkles, bg: "bg-pink-100", fg: "text-pink-600" },
  { key: "Founders Den", desc: "Event branding, marketing campaigns, promotional content, operational materials.", Icon: Rocket, bg: "bg-amber-100", fg: "text-amber-600" },
  { key: "Brampton FBLC", desc: "Board leadership, event branding, marketing campaigns, operational materials.", Icon: Briefcase, bg: "bg-green-100", fg: "text-green-600" },
  { key: "Ching Scholars", desc: "Marketing strategy, brand development, social media campaigns, event promotion.", Icon: GraduationCap, bg: "bg-blue-100", fg: "text-blue-600" },
  { key: "STEM Organizations", desc: "Graphics and content for various STEM clubs, committees, and initiatives.", Icon: FlaskConical, bg: "bg-teal-100", fg: "text-teal-600" },
  { key: "Volunteer Work", desc: "Community outreach, library programs, Hack the North, event support materials.", Icon: Heart, bg: "bg-rose-100", fg: "text-rose-600" },
  { key: "School Projects", desc: "Assignments, STEM graphics, club graphics, school events, presentations, research posters.", Icon: BookOpen, bg: "bg-orange-100", fg: "text-orange-600" },
  { key: "Personal Projects", desc: "Branding, logo design, typography, illustration, UI/UX, passion projects.", Icon: Palette, bg: "bg-fuchsia-100", fg: "text-fuchsia-600" },
  { key: "Branding", desc: "Logos, brand identities, color systems, templates, brand guidelines, merchandise.", Icon: PenTool, bg: "bg-purple-100", fg: "text-purple-600", isCategory: true },
  { key: "Website", desc: "Landing pages, wireframes, website mockups, app concepts, dashboards.", Icon: LayoutIcon, bg: "bg-cyan-100", fg: "text-cyan-600", isCategory: true },
  { key: "Miscellaneous", desc: "Additional creative work that doesn't fit neatly into other categories.", Icon: Shapes, bg: "bg-gray-100", fg: "text-gray-600", isCategory: true },
];

export default function Home() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api.get("/projects/stats").then(r => r.data) });
  const { data: featured } = useQuery({
    queryKey: ["featured"],
    queryFn: () => api.get("/projects", { params: { featured: true, limit: 6 } }).then(r => r.data),
  });
  const { data: recent } = useQuery({
    queryKey: ["recent"],
    queryFn: () => api.get("/projects", { params: { sort: "newest", limit: 8 } }).then(r => r.data),
  });

  const countFor = (name) => stats?.by_organization?.find(o => o.name === name)?.count
                        ?? stats?.by_category?.find(o => o.name === name)?.count ?? 0;

  return (
    <div className="fade-in">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-10">
        <p className="text-sm font-medium mb-3" style={{ color: "rgb(124, 58, 237)" }}>Design Portfolio</p>
        <h1 className="heading-font text-5xl md:text-6xl font-bold tracking-tight" style={{ color: "rgb(26, 26, 46)" }}>
          Crafting stories through<br />brand, visuals & motion.
        </h1>
        <p className="mt-5 max-w-2xl text-gray-600 text-lg">
          A living archive of my design work — automatically synced from Canva. Branding, marketing, photography,
          and everything in between for the organizations I've helped shape.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-6 text-sm text-gray-500">
          <span data-testid="stat-total"><strong className="text-gray-900">{stats?.total ?? 0}</strong> projects</span>
          <span data-testid="stat-featured"><strong className="text-gray-900">{stats?.featured ?? 0}</strong> featured</span>
          <span><strong className="text-gray-900">{stats?.by_organization?.length ?? 0}</strong> organizations</span>
          <Link to="/gallery" className="inline-flex items-center gap-1 font-medium" style={{ color: "rgb(124, 58, 237)" }} data-testid="hero-cta">
            View all work <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Featured strip */}
      {featured?.items?.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pb-12">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="heading-font text-2xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Featured Work</h2>
            <Link to="/gallery?featured=true" className="text-sm font-medium" style={{ color: "rgb(124, 58, 237)" }}>See all</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger" data-testid="featured-grid">
            {featured.items.slice(0, 6).map((p) => <ProjectCard key={p.id} project={p} aspect="4/3" />)}
          </div>
        </section>
      )}

      {/* Category cards (preserve original grid) */}
      <section className="max-w-7xl mx-auto px-6 pb-12">
        <h2 className="heading-font text-2xl font-bold mb-6" style={{ color: "rgb(26, 26, 46)" }}>Explore by organization</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 stagger">
          {CATS.map(({ key, desc, Icon, bg, fg, isCategory }) => {
            const to = isCategory ? `/category/${encodeURIComponent(key)}` : `/organization/${encodeURIComponent(key)}`;
            const count = countFor(key);
            return (
              <Link key={key} to={to} className="cat-card rounded-2xl p-6 border border-gray-100 bg-white block" data-testid={`cat-card-${key}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${bg}`}>
                  <Icon className={`w-5 h-5 ${fg}`} />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="canva-text font-semibold text-gray-800" style={{ fontSize: 19 }}>{key}</h3>
                  {count > 0 && <span className="text-xs text-gray-400">{count}</span>}
                </div>
                <p className="canva-text mt-2 text-sm text-gray-500">{desc}</p>
              </Link>
            );
          })}
          <Link to="/contact" className="cat-card rounded-2xl p-6 border border-gray-100 bg-white block" data-testid="cat-card-contact">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-violet-100">
              <Mail className="w-5 h-5 text-violet-600" />
            </div>
            <h3 className="canva-text font-semibold text-gray-800" style={{ fontSize: 19 }}>Contact</h3>
            <p className="canva-text mt-2 text-sm text-gray-500">Get in touch for collaborations, opportunities, or inquiries.</p>
          </Link>
        </div>
      </section>

      {/* Recently added */}
      {recent?.items?.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pb-24">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="heading-font text-2xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>Recently added</h2>
            <Link to="/gallery" className="text-sm font-medium" style={{ color: "rgb(124, 58, 237)" }}>Browse gallery</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 stagger" data-testid="recent-grid">
            {recent.items.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
