// ============================================================
// File: src/context/AuthContext.jsx
// Manages authentication state and API calls to backend
// ============================================================

import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const AuthProvider = ({ children }) => {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);


  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // Initialize auth
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setAccessToken(data.accessToken);
          const decoded = jwtDecode(data.accessToken);
          setUser({ email: decoded.email, id: decoded.id, familyId: decoded.familyId });
        }
      } catch (err) {
        console.warn("No active session found.");
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Refresh helper
  const refreshAccessToken = async () => {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) throw new Error("Refresh failed");

    const data = await response.json();
    setAccessToken(data.accessToken);
    accessTokenRef.current = data.accessToken;
    return data.accessToken;
  };

  
  // add token automatically
  const fetchWithAuth = async (url, options = {}) => {
    const makeRequest = (token) => fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    });

    let response = await makeRequest(accessTokenRef.current);

    // Token expired
    if (response.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        response = await makeRequest(newToken);
      } catch (err) {
        // Refresh też nie działa - wyloguj użytkownika
        setAccessToken(null);
        setUser(null);
        throw new Error("Session expired. Please log in again.");
      }
    }

    return response;
  };

  // 4. Login
  const login = async (googleToken) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: googleToken }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Login failed");
      }

      const data = await response.json();
      setAccessToken(data.accessToken);
      setUser(data.user);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

// 5. logout function
const logout = async () => {
  try {
    // 1. Call backend to destroy session
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    console.error("Logout backend call failed", err);
  } finally {
    // 2. Clear local state
    setAccessToken(null);
    setUser(null);
    // 3. Hard reset the app to clear ALL providers (including AppProvider)
    window.location.href = '/'; 
  }
};

  return (
    <AuthContext.Provider value={{ accessToken, user, isLoading, error, login, logout, fetchWithAuth }}>
      {children}
    </AuthContext.Provider>
  );
};