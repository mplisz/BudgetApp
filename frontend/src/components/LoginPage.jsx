// ============================================================
// File: src/components/LoginPage.jsx
// Renders the Google Login UI with error handling
// ============================================================

import { c } from "../styles/tokens";
import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login, error, isLoading } = useAuth();

  const handleSuccess = async (credentialResponse) => {
    try {
      // We wait for the login to finish to catch potential errors
      await login(credentialResponse.credential);
    } catch (err) {
      // Error is already set in AuthContext, but we catch it here 
      // to prevent "Uncaught in promise" in the console.
      console.error("Authentication flow failed:", err.message);
    }
  };

  const handleError = () => {
    console.error("Google Login popup closed or failed");
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '60vh',
      textAlign: 'center',
      fontFamily: 'sans-serif'
    }}>
      <h2 style={{ marginBottom: '10px', color: c.border }}>
        Budget App
      </h2>
      <p style={{ marginBottom: '30px', color: c.textSecondary, maxWidth: '300px' }}>
        Log in to access your shared family budget.
      </p>

      {/* Container for Google Button to keep it stable */}
      <div style={{ minHeight: '40px' }}>
        {!isLoading ? (
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            theme="filled_blue"
            shape="pill"
            text="signin_with"
          />
        ) : (
          <p style={{ color: c.indigo, fontWeight: 'bold' }}>Verifying...</p>
        )}
      </div>

      {/* Error Message Display */}
      {error && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px 20px', 
          backgroundColor: '#fef2f2', 
          color: c.danger, 
          borderRadius: '8px',
          border: '1px solid #fee2e2',
          fontSize: '14px',
          maxWidth: '300px'
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}