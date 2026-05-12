// ============================================================
// File: src/main.jsx
// Application entry point with all necessary context providers
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';

import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { AppProvider } from './context/AppContext.jsx'; // <--- Added AppProvider import

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AppProvider> {/* <--- Added AppProvider to wrap the App component */}
          <App />
        </AppProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);