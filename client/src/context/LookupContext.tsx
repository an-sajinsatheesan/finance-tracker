import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { LookupItem, LookupType, Lookups } from '../lib/types';
import { useAuth } from './AuthContext';

interface LookupState {
  lookups: Lookups;
  /** Active values of a type, in display order. */
  options: (type: LookupType) => LookupItem[];
  /** Display label for a stored code (falls back to the code itself). */
  label: (type: LookupType, code?: string | null) => string;
  find: (type: LookupType, code?: string | null) => LookupItem | undefined;
  reload: () => Promise<void>;
}

const Ctx = createContext<LookupState | null>(null);

/** Loads the enum table (global + this workspace's custom values) once per session. */
export function LookupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lookups, setLookups] = useState<Lookups>({});

  const reload = useCallback(async () => {
    setLookups(await api.get<Lookups>('/lookups'));
  }, []);

  useEffect(() => {
    if (user) reload().catch(() => undefined);
    else setLookups({});
  }, [user, reload]);

  const value = useMemo<LookupState>(() => {
    const find = (type: LookupType, code?: string | null) => lookups[type]?.find((l) => l.code === code);
    return {
      lookups,
      options: (type) => (lookups[type] ?? []).filter((l) => l.active),
      label: (type, code) => (code ? find(type, code)?.label ?? code : '—'),
      find,
      reload,
    };
  }, [lookups, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLookups() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLookups outside LookupProvider');
  return v;
}
