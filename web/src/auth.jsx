import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false });

  const refresh = useCallback(async () => {
    const [{ user }, setup] = await Promise.all([api('/auth/me'), api('/setup')]);
    setState({ loading: false, user, needsSetup: setup.needsSetup });
  }, []);

  useEffect(() => {
    refresh().catch(() => setState({ loading: false, user: null, needsSetup: false }));
  }, [refresh]);

  const value = {
    ...state,
    refresh,
    setUser: (user) => setState((s) => ({ ...s, user, needsSetup: false })),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' });
      setState((s) => ({ ...s, user: null }));
    },
    canUpload: state.user && state.user.role !== 'viewer',
    isAdmin: state.user?.role === 'admin',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
