import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => registration.unregister());
    }).catch(() => {});
  } catch {}
  if ('caches' in window) {
    try {
      caches.keys().then(keys => {
        keys.forEach(key => caches.delete(key));
      }).catch(() => {});
    } catch {}
  }
}

console.log("index.tsx: Starting render");
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("index.tsx: Root element not found!");
  throw new Error('Failed to find the root element');
}

console.log("index.tsx: Root element found, mounting React");
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
console.log("index.tsx: Render called");
