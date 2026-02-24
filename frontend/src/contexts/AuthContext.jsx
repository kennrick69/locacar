import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('locacar_token');
    if (token) {
      authAPI.me()
        .then(res => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('locacar_token');
          localStorage.removeItem('locacar_user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, senha) => {
    const res = await authAPI.login({ email, senha });
    localStorage.setItem('locacar_token', res.data.token);
    localStorage.setItem('locacar_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const tokenLogin = async (tokenCode) => {
    const res = await authAPI.tokenLogin(tokenCode);
    localStorage.setItem('locacar_token', res.data.token);
    localStorage.setItem('locacar_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    localStorage.setItem('locacar_token', res.data.token);
    localStorage.setItem('locacar_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem('locacar_token');
    localStorage.removeItem('locacar_user');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await authAPI.me();
      setUser(res.data);
    } catch (err) {
      console.error('Erro ao atualizar usuário:', err);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, tokenLogin, register, logout, refreshUser,
      isAdmin: user?.role === 'admin',
      isDriver: user?.role === 'motorista',
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
};
