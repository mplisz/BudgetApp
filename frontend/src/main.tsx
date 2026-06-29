// ============================================================
// File: src/main.jsx
// Application entry point with all necessary context providers.
//
// BrowserRouter is at the very top so all child components
// (including AuthProvider which now uses search params for token
// invalidation isn't needed yet, but AppContext might) can use
// router hooks.
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';

import App from './App';
import { AuthProvider }  from './context/AuthContext';
import { AppProvider }   from './context/AppContext';
import { ToastProvider,ToastContainer  } from './components/ui/ToastContainer';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <ToastProvider>
          <ToastContainer/>
          <AuthProvider>
            <AppProvider>
              <App />
            </AppProvider>
          </AuthProvider>
        </ToastProvider>
      </GoogleOAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
