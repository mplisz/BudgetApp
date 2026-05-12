// ============================================================
// File: src/context/AuthContext.jsx
// Manages authentication state and API calls to backend.
//
// Key design decision: accessTokenRef is always updated
// SYNCHRONOUSLY alongside setAccessToken() to avoid race
// conditions where fetchWithAuth fires before the useEffect
// that syncs the ref has had a chance to run.
// ============================================================

import { createContext, useState, useEffect, useContext, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const AuthProvider = ({ children }) => {
  const [accessToken, setAccessToken] = useState(null);
  const [user,        setUser]        = useState(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState(null);

  // Ref mirrors the access token so fetchWithAuth always reads
  // the latest value without needing accessToken in its closure.
  // IMPORTANT: update both ref and state together, synchronously.
  const accessTokenRef = useRef(null);

  // Helper: set token in both state and ref atomically
  function applyToken(token) {
    accessTokenRef.current = token;   // sync — always first
    setAccessToken(token);            // async re-render
  }

  // ── 1. Initialize auth on mount ───────────────────────────
  // Attempts a silent token refresh using the httpOnly refresh
  // cookie. If successful, the app is ready without a login page.
  useEffect(() => {
    async function initializeAuth() {
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method:      'POST',
          credentials: 'include',
        });

        if (response.ok) {
          const data    = await response.json();
          const decoded = jwtDecode(data.accessToken);
          applyToken(data.accessToken);
          setUser({
            email:    decoded.email,
            id:       decoded.id,
            familyId: decoded.familyId,
            name:     decoded.name,
          });
        }
      } catch (err) {
        console.warn('[Auth] No active session found.');
      } finally {
        setIsLoading(false);
      }
    }

    initializeAuth();
  }, []);

  // ── 2. Silent token refresh ───────────────────────────────
  // Called automatically by fetchWithAuth on 401 responses.
  const refreshAccessToken = async () => {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method:      'POST',
      credentials: 'include',
    });

    if (!response.ok) throw new Error('Refresh failed');

    const data = await response.json();
    applyToken(data.accessToken);     // ref updated synchronously
    return data.accessToken;
  };

  // ── 3. Authenticated fetch wrapper ───────────────────────
  // Automatically attaches the Bearer token and retries once
  // with a fresh token if the server returns 401.
  const fetchWithAuth = async (url, options = {}) => {
    const makeRequest = (token) => fetch(url, {
      ...options,
      headers: {
        'Content-Type':  'application/json',
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    });

    let response = await makeRequest(accessTokenRef.current);

    if (response.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        response       = await makeRequest(newToken);
      } catch (err) {
        // Refresh also failed — force logout
        applyToken(null);
        setUser(null);
        throw new Error('Session expired. Please log in again.');
      }
    }

    return response;
  };

  // ── 4. Google OAuth login ─────────────────────────────────
  const login = async (googleToken) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ token: googleToken }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      applyToken(data.accessToken);   // ref updated synchronously
      setUser(data.user);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // ── 5. Logout ─────────────────────────────────────────────
  // Calls backend to revoke the refresh token cookie, then
  // hard-resets the page to clear all React state.
  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method:      'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('[Auth] Logout backend call failed:', err);
    } finally {
      applyToken(null);
      setUser(null);
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ accessToken, user, isLoading, error, login, logout, fetchWithAuth }}>
      {children}
    </AuthContext.Provider>
  );
};