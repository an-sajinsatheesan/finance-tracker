/** Thin fetch wrapper. The API base URL comes from VITE_API_BASE_URL (never hardcoded). */
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const TOKEN_KEY = 'ft.token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the API running?');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/invitations/')) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

/** Flattens zod/server validation details into one readable line. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const d = err.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[]; errors?: string[] } | undefined;
    const extra = [
      ...(d?.formErrors ?? []),
      ...Object.entries(d?.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`),
      ...(d?.errors ?? []),
    ];
    return extra.length ? `${err.message} — ${extra.join('; ')}` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
};
