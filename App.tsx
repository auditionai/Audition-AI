import React from 'react';
import HomePage from './pages/HomePage';
import CreatorPage from './pages/CreatorPage';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, toast } = useAuth();

  return (
    <div className="bg-[#0B0B0F] text-white selection:bg-pink-500 selection:text-white">
      {user ? <CreatorPage /> : <HomePage />}

      {/* Toast Notification */}
      {toast && (
          <div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white animate-fade-in-up z-50 ${toast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}>
              {toast.message}
          </div>
      )}
    </div>
  );
}

export default App;
