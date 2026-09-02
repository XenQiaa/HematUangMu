import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { http } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    (async () => {
      try {
        const hash = location.hash || window.location.hash;
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const sessionId = params.get("session_id");
        if (!sessionId) {
          navigate("/", { replace: true });
          return;
        }
        await http.post("/auth/session", { session_id: sessionId });
        window.history.replaceState({}, "", "/dashboard");
        await refresh();
        navigate("/dashboard", { replace: true });
      } catch (e) {
        console.error(e);
        navigate("/", { replace: true });
      }
    })();
  }, [location, navigate, refresh]);

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-ochre border-t-transparent animate-spin" />
      <p className="text-stone-600" data-testid="auth-callback-loading">Menghubungkan akun…</p>
    </div>
  );
}
