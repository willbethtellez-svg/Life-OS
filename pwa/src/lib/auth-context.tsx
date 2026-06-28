import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string;
  baseUrl: string;
  login: (token: string, baseUrl: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'lifeos_auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { token: t, baseUrl: b } = JSON.parse(stored);
        if (t && b) {
          setToken(t);
          setBaseUrl(b);
          setIsAuthenticated(true);
        }
      } catch { }
    }
  }, []);

  const login = useCallback((newToken: string, newBaseUrl: string) => {
    setToken(newToken);
    setBaseUrl(newBaseUrl);
    setIsAuthenticated(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, baseUrl: newBaseUrl }));
  }, []);

  const logout = useCallback(() => {
    setToken('');
    setBaseUrl('');
    setIsAuthenticated(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, token, baseUrl, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
