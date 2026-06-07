import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="max-w-6xl mx-auto p-8 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin)
    return (
      <div className="max-w-6xl mx-auto p-8">
        <h2 className="text-lg font-semibold text-slate-900">Admin access required</h2>
        <p className="text-slate-600 mt-1">Your account is not an administrator.</p>
      </div>
    );
  return <>{children}</>;
}
