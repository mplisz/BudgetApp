// ============================================================
// File: src/context/AuthContext.tsx
// Manages authentication state and API calls to backend.
//
// Key design decisions:
//   1. accessTokenRef is always updated SYNCHRONOUSLY alongside
//      setAccessToken() to avoid races where fetchWithAuth fires
//      before the useEffect that syncs the ref has had a chance.
//   2. refreshAccessToken uses singleflight pattern — a shared
//      Promise reused by all concurrent callers. Without this,
//      a fresh page load with 4-10 parallel hooks → 4-10 hits
//      on /api/auth/refresh, wasting RU/s and surfacing extra
//      failure modes.
// ============================================================

import {
  createContext, useState, useEffect, useContext, useRef, useCallback,
} from "react";
import type { ReactNode } from "react";
import { jwtDecode } from "jwt-decode";
import {useToast} from "../hooks/useToast"
import { translateError } from "../data/constants/errorMessages";

// ── Types ────────────────────────────────────────────────────

export interface AuthUser {
  email:    string;
  id:       string;
  familyId: string;
  name:     string;
  picture?: string;
}

interface JwtPayload {
  email:    string;
  id:       string;
  familyId: string;
  name:     string;
  iat?:     number;
  exp?:     number;
}

interface AuthContextValue {
  accessToken:   string | null;
  user:          AuthUser | null;
  isLoading:     boolean;
  error:         string | null;
  login:         (googleToken: string) => Promise<void>;
  logout:        () => Promise<void>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

// ── Context ──────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Provider ─────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user,        setUser]        = useState<AuthUser | null>(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const { showWarning } = useToast() as { showWarning: (msg: string) => void };

  // Ref mirrors the access token so fetchWithAuth always reads the latest
  // value without needing accessToken in its closure.
  // IMPORTANT: update both ref and state together, synchronously.
  const accessTokenRef = useRef<string | null>(null);

  // Singleflight: stores the in-flight refresh Promise so concurrent
  // callers join the same request. Reset to null in `finally` so the
  // next 401 (after this refresh completes) can trigger a fresh refresh.
  const refreshInFlightRef = useRef<Promise<string> | null>(null);

  // Helper: set token in both state and ref atomically
  const applyToken = useCallback((token: string | null) => {
    accessTokenRef.current = token;   // sync — always first
    setAccessToken(token);            // async re-render
  }, []);

  // ── 1. Initialize auth on mount ───────────────────────────
  // Attempts a silent token refresh using the httpOnly refresh cookie.
  // If successful, the app is ready without showing the login page.
  useEffect(() => {


    async function initializeAuth() {
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method:      "POST",
          credentials: "include",
        });

        if (response.ok) {
          const data    = await response.json();
          const decoded = jwtDecode<JwtPayload>(data.accessToken);
          applyToken(data.accessToken);
          setUser({
            email:    decoded.email,
            id:       decoded.id,
            familyId: decoded.familyId,
            name:     decoded.name,
          });
        }else if (response.status === 429) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = translateError(errorData.error) || "Too many refresh attempts, please try again later.";
          showWarning(errMsg);
        }
      } catch (err) {
          // No active session — user will see login screen.
      } finally {
        setIsLoading(false);
      }
    }

    initializeAuth();
    // applyToken is stable (useCallback with empty deps)
  }, [applyToken]);

  // ── 2. Silent token refresh — SINGLEFLIGHT ─────────────────
  //
  // Without singleflight, a stale-access-token page load triggers a
  // refresh storm: every hook (settings, transactions, planned, currency,
  // …) fires its initial fetch in parallel, gets 401, and calls this
  // function. Each call hits /api/auth/refresh independently — wasting
  // RU/s, polluting logs, and (when we eventually add refresh-token
  // rotation) racing on a single-use refresh token.
  //
  // The pattern: store the Promise in a ref; if a second caller arrives
  // while the Promise is still pending, they get the SAME Promise and
  // await the SAME result. After the Promise settles (success or fail),
  // we clear the ref so the next future 401 can trigger a new refresh.
  const refreshAccessToken = useCallback(async (): Promise<string> => {
    if (refreshInFlightRef.current) {
      // A refresh is already in progress — join it.
      return refreshInFlightRef.current;
    }

    const promise = (async () => {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method:      "POST",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 429) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error || "Too many refresh attempts, please try again later.";
          showWarning(errMsg);
          throw new Error(errMsg); 
        }
        throw new Error("Session expired. Please log in again.");
      }

      const data = await response.json();
      applyToken(data.accessToken);     // ref updated synchronously
      return data.accessToken as string;
    })();

    refreshInFlightRef.current = promise;

    // Clear the slot once the Promise settles, regardless of outcome.
    // We DON'T wait for this in the return path — the caller already
    // has a reference to `promise` and gets its resolution directly.
    promise.finally(() => {
      // Only clear if it's still us — a logout could have replaced it
      // with null already (defensive, but the current logout path is
      // a full page reload so this is belt-and-suspenders).
      if (refreshInFlightRef.current === promise) {
        refreshInFlightRef.current = null;
      }
    });

    return promise;
  }, [applyToken]);

  // ── 3. Authenticated fetch wrapper ─────────────────────────
  // Attaches the Bearer token and retries once with a fresh token if
  // the server returns 401. Multiple concurrent 401s share a single
  // refresh request via singleflight.
  const fetchWithAuth = useCallback(async (
    url:     string,
    options: RequestInit = {},
  ): Promise<Response> => {
    const makeRequest = (token: string | null) => fetch(url, {
      ...options,
      headers: {
        "Content-Type":  "application/json",
        ...options.headers,
        "Authorization": `Bearer ${token ?? ""}`,
      },
    });

    let response = await makeRequest(accessTokenRef.current);

   /* if (response.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        response       = await makeRequest(newToken);
      } catch (refreshErr) {
        // Refresh also failed — force logout state.
        // Note: every caller currently waiting on the same singleflight
        // Promise will hit this catch too. They'll each call applyToken(null)
        // and setUser(null), but those are idempotent so it's fine.
        applyToken(null);
        setUser(null);
        throw new Error("Session expired. Please log in again.");
      }
    }
    */
      if (response.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        response       = await makeRequest(newToken);
      } catch (refreshErr) {
        // Refresh also failed — force logout state.
        // Note: every caller currently waiting on the same singleflight
        // Promise will hit this catch too. They'll each call applyToken(null)
        // and setUser(null), but those are idempotent so it's fine.
        applyToken(null);
        setUser(null);
        // Get the error
        const errMsg = refreshErr instanceof Error 
            ? refreshErr.message 
            : "Session expired. Please log in again.";
        // ShowToast
        showWarning(translateError(errMsg)); 
        
        throw refreshErr;
      }
    }


    return response;
  }, [applyToken, refreshAccessToken]);

  // ── 4. Google OAuth login ──────────────────────────────────
  const login = useCallback(async (googleToken: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ token: googleToken }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Login failed");
      }

      const data = await response.json();
      applyToken(data.accessToken);
      setUser(data.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applyToken]);

  // ── 5. Logout ───────────────────────────────────────────────
  // Calls backend to revoke the refresh token cookie, then hard-resets
  // the page to clear all React state.
  const logout = useCallback(async (): Promise<void> => {
    // Invalidate any in-flight refresh so it can't accidentally restore
    // the session after we've cleared the cookie.
    refreshInFlightRef.current = null;

    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method:      "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("[Auth] Logout backend call failed:", err);
    } finally {
      applyToken(null);
      setUser(null);
      window.location.href = "/";
    }
  }, [applyToken]);

  const value: AuthContextValue = {
    accessToken,
    user,
    isLoading,
    error,
    login,
    logout,
    fetchWithAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
