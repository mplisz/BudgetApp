// ============================================================
// File: src/data/api/client.ts
// Single HTTP client for the whole app. Owns:
//   - the base URL (was redeclared in ~21 files)
//   - JSON body serialization
//   - ok-check + error translation (translateError)
//   - body parsing (incl. empty 204 responses)
//   - a typed ApiError carrying status + raw body, so callers can
//     react to specific statuses (e.g. the 409 "requires confirmation"
//     sentinel) without re-implementing fetch plumbing.
//
// The client is auth-agnostic: it wraps the `fetchWithAuth` provided by
// AuthContext (which injects the Bearer token + Content-Type and handles
// 401 refresh). Construct one per session via the useApi() hook.
// ============================================================

import { translateError } from "../constants/errorMessages";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>;

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

// Thrown on any non-ok response. `.message` is already translated to
// Polish (so existing `showError((err as Error).message)` keeps working),
// while `.status` and `.body` expose the raw response for callers that
// need to branch (e.g. 409 confirmation, 207 multi-status).
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  /** Plain JSON body — serialized automatically. Omit for GET/DELETE-without-body. */
  body?: unknown;
  /** Polish fallback message when the backend sends no recognizable error key. */
  fallback?: string;
  /** Extra HTTP statuses to treat as success (e.g. 207 multi-status from /batch). */
  okStatuses?: number[];
  /** Escape hatch for raw fetch options (signal, credentials, custom headers). */
  init?: RequestInit;
}

// Parse a response body without throwing on empty (204) or non-JSON payloads.
async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorKeyOf(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    return typeof e === "string" ? e : undefined;
  }
  return undefined;
}

export function createApiClient(fetchWithAuth: FetchWithAuth) {
  async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const init: RequestInit = { method, ...opts.init };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    const res = await fetchWithAuth(`${API_URL}${path}`, init);
    const ok = res.ok || (opts.okStatuses?.includes(res.status) ?? false);
    const body = await parseBody(res);

    if (!ok) {
      throw new ApiError(translateError(errorKeyOf(body), opts.fallback), res.status, body);
    }
    return body as T;
  }

  return {
    request,
    get:   <T>(path: string, opts?: RequestOptions)                  => request<T>("GET", path, opts),
    post:  <T>(path: string, body?: unknown, opts?: RequestOptions)  => request<T>("POST", path, { ...opts, body }),
    patch: <T>(path: string, body?: unknown, opts?: RequestOptions)  => request<T>("PATCH", path, { ...opts, body }),
    put:   <T>(path: string, body?: unknown, opts?: RequestOptions)  => request<T>("PUT", path, { ...opts, body }),
    del:   <T>(path: string, body?: unknown, opts?: RequestOptions)  => request<T>("DELETE", path, { ...opts, body }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
