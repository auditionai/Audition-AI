/**
 * TopBar with real Vcoin balance from AuthContext
 * Listens to balance_updated events for real-time updates
 */

import { Coins, Settings } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const hiddenRoutes = ['/', '/login', '/payment-gateway', '/admin'];
  if (hiddenRoutes.includes(location.pathname)) return null;

  const vcoinDisplay = user?.vcoin_balance != null
    ? user.vcoin_balance.toLocaleString()
    : '---';

  return (
    <div className="sticky top-0 z-40 bg-white dark:bg-[#18181B]/80 backdrop-blur-xl border-b border-gray-100 dark:border-zinc-800/50 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#111] to-[#333] flex items-center justify-center text-white font-bold text-sm shadow-sm">
          A
        </div>
        <span className="font-semibold tracking-tight text-base text-gray-800 dark:text-zinc-100">Audition AI</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Vcoin Balance */}
        <Link to="/topup">
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full active:scale-95 transition-transform">
            <Coins className="w-3.5 h-3.5 text-yellow-600" />
            <span className="text-xs font-bold text-gray-700 dark:text-zinc-200">{vcoinDisplay}</span>
          </div>
        </Link>
        <button
          onClick={() => navigate('/profile')}
          className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Settings className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
        </button>
      </div>
    </div>
  );
}
