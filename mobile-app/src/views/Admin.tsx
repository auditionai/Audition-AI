import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Admin as DesktopAdmin } from '../../../views/Admin';

export function AdminView() {
  const { userRole } = useAuth();

  if (userRole !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen bg-[#09090B]">
      <DesktopAdmin lang="vi" isAdmin />
    </div>
  );
}
