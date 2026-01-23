/** @format */

import React, {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
} from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
		console.log(
			"AuthProvider initializing with token:",
			storedToken ? "YES" : "NO"
		);
		return storedToken;
	});
	const [loading, setLoading] = useState(false);
	const hasRestoredFromStorage = useRef(false);

	// Restore user from localStorage on mount if state is empty
	useEffect(() => {
		// Only run once on initial mount using ref
		if (hasRestoredFromStorage.current) return;
		hasRestoredFromStorage.current = true;

		if (!user) {
			const storedUser = localStorage.getItem("flixz_user");
			const storedToken = localStorage.getItem("flixz_token");

			if (storedUser && storedToken) {
				console.log("AuthProvider: Restoring user from localStorage on mount");
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
		}
	}, [user]);

	// Listen for storage events in other tabs (logout in another tab)
	useEffect(() => {
		const handleStorageChange = (e) => {
			if (e.key === "flixz_user" && !e.newValue) {
				console.log("AuthProvider: User cleared in another tab");
				setUser(null);
				setToken(null);
			}
		};

		window.addEventListener("storage", handleStorageChange);
		return () => window.removeEventListener("storage", handleStorageChange);
	}, []);

	const login = useCallback((userData, accessToken) => {
		console.log(
			"AuthProvider.login called with:",
			userData.email,
			"Token:",
			accessToken ? "YES" : "NO"
		);

		// Save user data
		setUser(userData);
		localStorage.setItem("flixz_user", JSON.stringify(userData));
		console.log("AuthProvider: User saved to state and localStorage");

		// Save token if provided (for OAuth, token might be in cookies instead)
		if (accessToken) {
			setToken(accessToken);
			localStorage.setItem("flixz_token", accessToken);
			console.log("AuthProvider: Token saved to state and localStorage");
		} else {
			// For OAuth, token is in cookies, but we still set a placeholder
			setToken("oauth_cookie");
			localStorage.setItem("flixz_token", "oauth_cookie");
			console.log("AuthProvider: OAuth mode - token stored as 'oauth_cookie'");
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
		// For OAuth users, token is "oauth_cookie" which means auth is via cookies
		if (token && token !== "oauth_cookie") {
			return { Authorization: `Bearer ${token}` };
		}
		// For OAuth or no token, rely on cookies (withCredentials: true in axios calls)
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
			}}>
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
