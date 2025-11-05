import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Add .tsx extension to module imports.
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import './utils/supabaseClient'; // Khởi tạo kết nối supabase
import './index.css'; // Import Tailwind CSS

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);