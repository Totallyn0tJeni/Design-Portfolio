import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/gallery", label: "Gallery" },
  { to: "/contact", label: "Contact" },
];

export default function Layout() {
  const { user } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: "rgb(250, 250, 250)" }}>
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" data-testid="nav-brand" className="flex items-center gap-2">
            <span className="heading-font text-xl font-bold" style={{ color: "rgb(26, 26, 46)" }}>
              Jenisha Patel
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgb(245, 243, 255)", color: "rgb(124, 58, 237)" }}>
              Design
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                data-testid={`nav-${n.label.toLowerCase()}`}>
                {n.label}
              </NavLink>
            ))}
            {user ? (
              <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} data-testid="nav-admin">
                Admin
              </NavLink>
            ) : (
              <Link to="/login" data-testid="nav-login" className="nav-link">Sign in</Link>
            )}
          </nav>
          <button className="md:hidden p-2" onClick={() => setOpen(!open)} data-testid="nav-mobile-toggle">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <div className="px-6 py-3 flex flex-col gap-3">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
                  className={({ isActive }) => `nav-link py-1 ${isActive ? "active" : ""}`}>
                  {n.label}
                </NavLink>
              ))}
              {user ? <NavLink to="/admin" onClick={() => setOpen(false)} className="nav-link py-1">Admin</NavLink>
                    : <Link to="/login" onClick={() => setOpen(false)} className="nav-link py-1">Sign in</Link>}
            </div>
          </div>
        )}
      </header>

      <main key={loc.pathname}><Outlet /></main>

      <footer className="border-t border-gray-100 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <span>© {new Date().getFullYear()} Jenisha Patel. All designs original.</span>
          <span className="flex items-center gap-2">
            Powered by <span style={{ color: "rgb(124, 58, 237)" }} className="font-medium">Canva</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
