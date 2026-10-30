import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../lib/api';
import type { AuthUser, Workspace } from '../lib/types';

interface AuthState {
  user: AuthUser | null;
  workspace: Workspace | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshWorkspace: () => Promise<void>;
  memberName: (id?: string | null) => string;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setWorkspace(null);
  }, []);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const loadMe = useCallback(async () => {
    const me = await api.get<{ user: AuthUser; workspace: Workspace }>('/auth/me');
    setUser(me.user);
    setWorkspace(me.workspace);
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    loadMe().catch(logout).finally(() => setLoading(false));
  }, [loadMe, logout]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await api.post<{ token: string }>('/auth/login', { username, password });
    tokenStore.set(r.token);
    await loadMe();
  }, [loadMe]);

  const refreshWorkspace = useCallback(async () => {
    setWorkspace(await api.get<Workspace>('/workspace'));
  }, []);

  const memberName = useCallback(
    (id?: string | null) => workspace?.members.find((m) => m.userId === id)?.displayName ?? '—',
    [workspace],
  );

  const value = useMemo(
    () => ({ user, workspace, loading, login, logout, refreshWorkspace, memberName }),
    [user, workspace, loading, login, logout, refreshWorkspace, memberName],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
