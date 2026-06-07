import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function navClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
  }`;
}

export default function Layout() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 mr-4">
            <span className="text-xl">🤖</span>
            <span className="font-bold text-slate-900">RobotHub</span>
            <span className="hidden sm:inline text-xs text-slate-400 font-normal">Robotic Data Platform</span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              News
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin/topics" className={navClass}>
                  Topics
                </NavLink>
                <NavLink to="/admin/logs" className={navClass}>
                  Logs
                </NavLink>
                <NavLink to="/admin/settings" className={navClass}>
                  Settings
                </NavLink>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-slate-500 hidden sm:inline">
                  {user.email}
                  {isAdmin && <span className="ml-1 text-xs text-brand-600 font-semibold">admin</span>}
                </span>
                <button
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                  className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="text-sm px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 w-full">
        <Outlet />
      </main>
    </div>
  );
}
