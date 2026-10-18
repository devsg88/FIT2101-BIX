import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSessionExpiredHandler } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, name, role, token }
  const navigate = useNavigate();

  const login = (userData) => setUser(userData);
  const logout = () => setUser(null);

  // NFR-01: api.js calls this when any authenticated request comes back
  // 401 (expired/invalid token) - clears the stale session and sends the
  // user back to Login, which reads sessionExpired to show its banner.
  // Registered once per mount; api.js holds at most one handler at a time,
  // same as this app only ever has one AuthProvider.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      navigate('/login?sessionExpired=1', { replace: true });
    });
    return () => setSessionExpiredHandler(null);
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
