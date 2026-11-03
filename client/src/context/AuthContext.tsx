import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, setUnauthorizedHandler, tokenStore } from '../lib/api';
import type { AuthUser, InviteResult, Workspace } from '../lib/types';

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  relationship: string;
  mode: 'personal' | 'couple';
  partner?: { displayName: string; email: string; relationship: string } | null;
}

interface AuthState {
  user: AuthUser | null;
  workspace: Workspace | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<InviteResult | null>;
  acceptInvite: (token: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshWorkspace: () => Promise<void>;
  memberName: (id?: string | null) => string;
  /** True when the workspace has two members (common expenses are shared). */
  isCouple: boolean;
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
    // Only a rejected session (401/403) signs out. A server that is restarting or briefly
    // unreachable is retried, so a dev reload or a network blip doesn't drop the session.
    const restore = async () => {
      for (let attempt = 0; ; attempt++) {
        try { await loadMe(); return; } catch (err) {
          const rejected = err instanceof ApiError && (err.status === 401 || err.status === 403);
          if (rejected || attempt >= 4) { if (rejected) logout(); return; }
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    };
    restore().finally(() => setLoading(false));
  }, [loadMe, logout]);

  const startSession = useCallback(async (token: string) => {
    tokenStore.set(token);
    await loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string }>('/auth/login', { email, password });
    await startSession(r.token);
  }, [startSession]);

  const register = useCallback(async (input: RegisterInput) => {
    const r = await api.post<{ token: string; invite: InviteResult | null }>('/auth/register', input);
    await startSession(r.token);
    return r.invite;
  }, [startSession]);

  const acceptInvite = useCallback(async (token: string, password: string, displayName?: string) => {
    const r = await api.post<{ token: string }>(`/invitations/${token}/accept`, { password, displayName });
    await startSession(r.token);
  }, [startSession]);

  // Reloads you and the workspace (after changing your email or name, members, rates…).
  const refreshWorkspace = useCallback(async () => {
    const me = await api.get<{ user: AuthUser; workspace: Workspace }>('/auth/me');
    setUser(me.user);
    setWorkspace(me.workspace);
  }, []);

  const memberName = useCallback(
    (id?: string | null) => workspace?.members.find((m) => m.userId === id)?.displayName ?? '—',
    [workspace],
  );

  const isCouple = (workspace?.members.length ?? 0) > 1;

  const value = useMemo(
    () => ({ user, workspace, loading, login, register, acceptInvite, logout, refreshWorkspace, memberName, isCouple }),
    [user, workspace, loading, login, register, acceptInvite, logout, refreshWorkspace, memberName, isCouple],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
