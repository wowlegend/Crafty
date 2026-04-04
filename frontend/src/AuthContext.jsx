import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null); // Tokens now stay in memory only (immune to XSS)
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  // Configure axios defaults for secure HttpOnly cookie sessions
  useEffect(() => {
    axios.defaults.withCredentials = true;
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Check if user is logged in on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/auth/me`);
        setUser(response.data);
      } catch (error) {
        // Not authenticated
        setToken(null);
        setUser(null);
      }
      setLoading(false);
    };

    checkAuth();
  }, [BACKEND_URL]);

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
        username,
        password
      });

      const { access_token, user: userData } = response.data;

      // Do NOT save to localStorage to prevent XSS
      setToken(access_token);
      setUser(userData);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Login failed'
      };
    }
  };

  const register = async (username, email, password) => {
    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/register`, {
        username,
        email,
        password
      });

      const { access_token, user: userData } = response.data;

      // Do NOT save to localStorage to prevent XSS
      setToken(access_token);
      setUser(userData);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Registration failed'
      };
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${BACKEND_URL}/api/auth/logout`);
    } catch(e) {}
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};