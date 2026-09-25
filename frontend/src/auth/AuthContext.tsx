import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, clearToken, getToken } from "@/src/api/client";
import { registerForPush } from "@/src/utils/push";

export type User = {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  subscription_expires_at: string | null;
  is_subscribed: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      registerForPush(me.id);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    await setToken(res.access_token);
    setUser(res.user);
    registerForPush(res.user.id);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST",
      auth: false,
      body: { username, email, password },
    });
    await setToken(res.access_token);
    setUser(res.user);
    registerForPush(res.user.id);
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
