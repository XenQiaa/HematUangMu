import { http } from "./api";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      const { data } = await http.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    check();
  }, [check]);

  const login = async (identifier, password) => {
    const { data } = await http.post("/auth/login", { identifier, password });
    setUser(data);
    return data;
  };

  const register = async (payload) => {
    const { data } = await http.post("/auth/register", payload);
    setUser(data);
    return data;
  };

  const logout = async () => {
    await http.post("/auth/logout").catch(() => {});
    setUser(null);
    window.location.href = "/";
  };

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, refresh: check, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export const loginWithGoogle = () => {
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

export function formatApiError(detail) {
  if (detail == null) return "Terjadi kesalahan. Coba lagi.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" · ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
