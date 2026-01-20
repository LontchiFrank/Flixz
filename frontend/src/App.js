/** @format */

import React, { useEffect, useState, useRef } from "react";
import {
	BrowserRouter,
	Routes,
	Route,
	useLocation,
	useNavigate,
	Navigate,
} from "react-router-dom";
import axios from "axios";
import { Toaster } from "sonner";

// Pages
import HomePage from "./pages/HomePage";
import BrowsePage from "./pages/BrowsePage";
import DetailPage from "./pages/DetailPage";
import WatchPage from "./pages/WatchPage";
import WatchPartyPage from "./pages/WatchPartyPage";
import MyListPage from "./pages/MyListPage";
import SearchPage from "./pages/SearchPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import CustomContentPage from "./pages/CustomContentPage";

// Components
import Sidebar from "./components/layout/Sidebar";
import MobileNav from "./components/layout/MobileNav";

// Context
import { AuthProvider, useAuth } from "./context/AuthContext";

import "./App.css";

const BACKEND_URL = "https://flixz.onrender.com";
// process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Auth Callback Component
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const AuthCallback = () => {
	const hasProcessed = useRef(false);
	const navigate = useNavigate();
	const { login } = useAuth();

	useEffect(() => {
		if (hasProcessed.current) return;
		hasProcessed.current = true;

		const processSession = async () => {
			const hash = window.location.hash;
			const sessionId = new URLSearchParams(hash.substring(1)).get(
				"session_id"
			);

			if (sessionId) {
				try {
					const response = await axios.get(`${API}/auth/session`, {
						headers: { "X-Session-ID": sessionId },
						withCredentials: true,
					});
					login(response.data, null);
					navigate("/browse", {
						replace: true,
						state: { user: response.data },
					});
				} catch (error) {
					console.error("Auth failed:", error);
					navigate("/login", { replace: true });
				}
			} else {
				navigate("/login", { replace: true });
			}
		};

		processSession();
	}, [navigate, login]);

	return (
		<div className="min-h-screen bg-[#050505] flex items-center justify-center">
			<div className="animate-pulse text-white">Authenticating...</div>
		</div>
	);
};

// Protected Route
const ProtectedRoute = ({ children }) => {
	const { user, loading, checkAuth } = useAuth();
	const location = useLocation();
	const [isChecking, setIsChecking] = useState(true);

	useEffect(() => {
		if (location.state?.user) {
			setIsChecking(false);
			return;
		}

		const verify = async () => {
			await checkAuth();
			setIsChecking(false);
		};
		verify();
	}, [checkAuth, location.state]);

	if (isChecking || loading) {
		return (
			<div className="min-h-screen bg-[#050505] flex items-center justify-center">
				<div className="animate-pulse text-white">Loading...</div>
			</div>
		);
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	return children;
};

// App Router
const AppRouter = () => {
	const location = useLocation();

	// Check for session_id in hash before rendering routes
	if (location.hash?.includes("session_id=")) {
		return <AuthCallback />;
	}

	return (
		<div className="flex min-h-screen bg-[#050505]">
			<Sidebar />
			<main className="flex-1 md:ml-20">
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/login" element={<LoginPage />} />
					<Route path="/register" element={<RegisterPage />} />
					<Route path="/browse" element={<BrowsePage />} />
					<Route path="/browse/:category" element={<BrowsePage />} />
					<Route path="/movie/:id" element={<DetailPage type="movie" />} />
					<Route path="/tv/:id" element={<DetailPage type="tv" />} />
					<Route path="/watch/:type/:id" element={<WatchPage />} />
					<Route path="/search" element={<SearchPage />} />
					<Route
						path="/my-list"
						element={
							<ProtectedRoute>
								<MyListPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/profile"
						element={
							<ProtectedRoute>
								<ProfilePage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/my-uploads"
						element={
							<ProtectedRoute>
								<CustomContentPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/watch-party"
						element={
							<ProtectedRoute>
								<WatchPartyPage />
							</ProtectedRoute>
						}
					/>
					<Route
						path="/watch-party/:roomId"
						element={
							<ProtectedRoute>
								<WatchPartyPage />
							</ProtectedRoute>
						}
					/>
				</Routes>
			</main>
			<MobileNav />
		</div>
	);
};

function App() {
	return (
		<AuthProvider>
			<BrowserRouter>
				<AppRouter />
				<Toaster
					position="bottom-right"
					toastOptions={{
						style: {
							background: "#0A0A0A",
							border: "1px solid rgba(255,255,255,0.1)",
							color: "#fff",
						},
					}}
				/>
			</BrowserRouter>
		</AuthProvider>
	);
}

export default App;
