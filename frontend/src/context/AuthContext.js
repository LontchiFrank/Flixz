import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://flixz.onrender.com";
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("flixz_user");
    console.log("AuthProvider initializing with user:", stored ? "YES" : "NO");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem("flixz_token");
    console.log("AuthProvider initializing with token:", storedToken ? "YES" : "NO");
    return storedToken;
  });
  const [loading, setLoading] = useState(false);

  // Sync user state with localStorage on mount and when storage changes
  useEffect(() => {
    const syncUserFromStorage = () => {
      const storedUser = localStorage.getItem("flixz_user");
      const storedToken = localStorage.getItem("flixz_token");

      // If localStorage has user but state doesn't, restore it
      if (storedUser && storedToken && !user) {
        console.log("AuthProvider: Restoring user from localStorage");
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setToken(storedToken);
        } catch (e) {
          console.error("Failed to parse stored user:", e);
          localStorage.removeItem("flixz_user");
          localStorage.removeItem("flixz_token");
        }
      }

      // If state has user but localStorage doesn't, clear state
      if (user && (!storedUser || !storedToken)) {
        console.log("AuthProvider: localStorage cleared, clearing user state");
        setUser(null);
        setToken(null);
      }
    };

    syncUserFromStorage();

    // Listen for storage events (e.g., user logs out in another tab)
    window.addEventListener('storage', syncUserFromStorage);
    return () => window.removeEventListener('storage', syncUserFromStorage);
  }, [user]);

  const login = useCallback((userData, accessToken) => {
    console.log("AuthProvider.login called with:", userData.email);
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("flixz_user", JSON.stringify(userData));
    if (accessToken) {
      localStorage.setItem("flixz_token", accessToken);
    }
  }, []);

  const logout = useCallback(async () => {
    console.log("AuthProvider.logout called");
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch (e) {
      console.error("Logout error:", e);
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem("flixz_user");
    localStorage.removeItem("flixz_token");
    console.log("User logged out, localStorage cleared");
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await axios.get(`${API}/auth/me`, {
        headers,
        withCredentials: true,
      });
      setUser(response.data);
      localStorage.setItem("flixz_user", JSON.stringify(response.data));
      return response.data;
    } catch (e) {
      console.error("Auth check failed:", e.response?.status, e.response?.data);
      // Only logout if it's a 401 Unauthorized, not other errors like network issues
      if (e.response?.status === 401) {
        setUser(null);
        setToken(null);
        localStorage.removeItem("flixz_user");
        localStorage.removeItem("flixz_token");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const getAuthHeaders = useCallback(() => {
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        checkAuth,
        getAuthHeaders,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
