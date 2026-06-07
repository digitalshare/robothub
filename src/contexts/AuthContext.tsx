import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { insforge } from '../lib/insforge';
import { isCurrentUserAdmin } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function ensureProfile(userId: string, name?: string) {
  // RLS allows a user to insert their own profile row; ignore duplicates.
  try {
    await insforge.database.from('profiles').insert([{ user_id: userId, display_name: name || null }]);
  } catch {
    /* row already exists */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await insforge.auth.getCurrentUser();
    const u = data?.user;
    if (u) {
      setUser({ id: u.id, email: u.email, name: u.profile?.name });
      await ensureProfile(u.id, u.profile?.name);
      setIsAdmin(await isCurrentUserAdmin());
    } else {
      setUser(null);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await insforge.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message || 'Sign in failed');
      if (!data?.accessToken) throw new Error('Sign in failed');
      await refresh();
    },
    [refresh]
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const { data, error } = await insforge.auth.signUp({ email, password, name });
      if (error) throw new Error(error.message || 'Sign up failed');
      if (!data?.accessToken) {
        // Email verification still on: try to sign in to surface a clear state.
        await insforge.auth.signInWithPassword({ email, password });
      }
      await refresh();
    },
    [refresh]
  );

  const signOut = useCallback(async () => {
    await insforge.auth.signOut();
    setUser(null);
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
