import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function AuthCallback() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const hash = new URLSearchParams(window.location.hash.replace("#", "?"));
    const session_id = hash.get("session_id");
    if (!session_id) { navigate("/login", { replace: true }); return; }
    api.post("/auth/session", { session_id })
      .then(() => { window.history.replaceState({}, "", "/admin"); navigate("/admin", { replace: true }); })
      .catch((err) => {
        const detail = err?.response?.data?.detail || "Sign-in failed";
        alert(detail);
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
      Signing you in…
    </div>
  );
}
