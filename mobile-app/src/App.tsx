import { useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader } from 'lucide-react';
import { NotificationProvider, useNotification } from './components/NotificationSystem';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MobileLayout } from './components/layout/MobileLayout';
import { Splash } from './views/Splash';
import { Home } from './views/Home';
import { WorkspaceImage } from './views/WorkspaceImage';
import { WorkspaceVideo } from './views/WorkspaceVideo';
import { WorkspaceEdit } from './views/WorkspaceEdit';
import { WorkspacePromptImage } from './views/WorkspacePromptImage';
import { Gallery } from './views/Gallery';
import { TopUp } from './views/TopUp';
import { Settings } from './views/Settings';
import { About } from './views/About';
import { Support } from './views/Support';
import { Guide } from './views/Guide';
import { AdminView } from './views/Admin';
import { PaymentGatewayView } from './views/PaymentGateway';
import { syncPayOSTransaction } from './services/serverQueueService';
import './mobile-shell.css';

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#18181B]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#111] to-[#444] shadow-2xl flex items-center justify-center">
            <span className="text-white text-3xl font-bold">A</span>
          </div>
          <Loader className="w-6 h-6 animate-spin text-gray-400 dark:text-zinc-500" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {!isAuthenticated ? (
        <>
          <Route path="/" element={<Splash />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route element={<MobileLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/generate/image" element={<WorkspaceImage />} />
            <Route path="/generate/video" element={<WorkspaceVideo />} />
            <Route path="/tools/ai-image" element={<WorkspacePromptImage />} />
            <Route path="/tools/:toolId" element={<WorkspaceEdit />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/topup" element={<TopUp />} />
            <Route path="/payment-gateway" element={<PaymentGatewayView />} />
            <Route path="/profile" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/admin" element={<AdminView />} />
          </Route>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </>
      )}
    </Routes>
  );
}

function MobileRuntimeEffects() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { isAuthenticated, maintenanceMode, userRole } = useAuth();

  const handledPayOsReturnRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    const orderCode = params.get('orderCode');

    if (!status) return;

    const returnKey = `${status}:${orderCode || ''}`;
    if (handledPayOsReturnRef.current === returnKey) return;
    handledPayOsReturnRef.current = returnKey;

    const handleReturn = async () => {
      if (status === 'PAID') {
        if (orderCode) {
          try {
            await syncPayOSTransaction(orderCode);
            window.dispatchEvent(new Event('balance_updated'));
            notify('Thanh toán thành công! Vcoin đã được cộng tự động.', 'success');
          } catch (error) {
            console.error('Failed to sync PayOS transaction on mobile return:', error);
            notify('Thanh toán đã ghi nhận. Hệ thống đang đồng bộ giao dịch...', 'info');
          }
        } else {
          notify('Thanh toán thành công! Vcoin sẽ được cộng trong giây lát.', 'success');
        }
        navigate('/topup', { replace: true });
        return;
      }

      if (status === 'CANCELLED') {
        notify('Đã hủy thanh toán.', 'error');
        navigate('/topup', { replace: true });
        return;
      }

      navigate(location.pathname, { replace: true });
    };

    void handleReturn();
  }, [location.pathname, location.search, navigate, notify]);

  if (!(isAuthenticated && maintenanceMode.isActive && userRole !== 'admin')) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md p-5">
      <div className="w-full max-w-sm rounded-[32px] border border-red-500/20 bg-white p-6 text-center shadow-2xl animate-slide-up dark:bg-[#18181B]">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Hệ thống đang bảo trì</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed mb-6">
          {maintenanceMode.message || 'Hệ thống đang bảo trì, vui lòng quay lại sau.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-black py-3 text-sm font-semibold"
        >
          Tải lại trang
        </button>
      </div>
    </div>
  );
}

function MobileAppShell() {
  return (
    <>
      <AppRoutes />
      <MobileRuntimeEffects />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <NotificationProvider>
          <AuthProvider>
            <MobileAppShell />
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
