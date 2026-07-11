import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    api.get("/auth/me").then(r => setUser(r.data)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setUser(null);
    window.location.href = "/";
  };

  return { user, loading, logout };
}
