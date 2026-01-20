import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  Home,
  Film,
  Tv,
  Search,
  Heart,
  Users,
  LogOut,
  LogIn,
  Sparkles,
} from "lucide-react";

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Film, label: "Movies", path: "/browse/movies" },
    { icon: Tv, label: "TV Shows", path: "/browse/tv" },
    { icon: Search, label: "Search", path: "/search" },
    { icon: Heart, label: "My List", path: "/my-list", auth: true },
    { icon: Users, label: "Watch Party", path: "/watch-party", auth: true },
  ];

  return (
    <aside
      className="fixed left-0 top-0 h-full w-20 bg-black/90 border-r border-white/5 flex-col items-center py-8 z-50 backdrop-blur-xl hidden md:flex"
      data-testid="sidebar"
    >
      {/* Logo */}
      <NavLink to="/" className="mb-12">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
      </NavLink>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-4">
        {navItems.map(({ icon: Icon, label, path, auth }) => {
          if (auth && !user) return null;
          return (
            <NavLink
              key={path}
              to={path}
              data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
              className={({ isActive }) =>
                `group relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-[#7C3AED] text-white neon-glow"
                    : "text-[#A1A1AA] hover:text-white hover:bg-white/5"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="absolute left-16 px-3 py-1.5 rounded-lg bg-black/90 text-white text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
                {label}
              </span>
            </NavLink>
          );
        })}
      </nav>

      {/* Auth */}
      <div className="mt-auto flex flex-col gap-4">
        {user ? (
          <>
            <NavLink
              to="/profile"
              data-testid="profile-btn"
              className="group relative flex items-center justify-center w-12 h-12 rounded-xl overflow-hidden border border-white/10 hover:border-[#7C3AED] transition-all"
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[#7C3AED] flex items-center justify-center text-white font-semibold">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute left-16 px-3 py-1.5 rounded-lg bg-black/90 text-white text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
                {user.name}
              </span>
            </NavLink>
            <button
              onClick={handleLogout}
              data-testid="logout-btn"
              className="group relative flex items-center justify-center w-12 h-12 rounded-xl text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="absolute left-16 px-3 py-1.5 rounded-lg bg-black/90 text-white text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
                Logout
              </span>
            </button>
          </>
        ) : (
          <NavLink
            to="/login"
            data-testid="login-btn"
            className="group relative flex items-center justify-center w-12 h-12 rounded-xl text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-all"
          >
            <LogIn className="w-5 h-5" />
            <span className="absolute left-16 px-3 py-1.5 rounded-lg bg-black/90 text-white text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
              Login
            </span>
          </NavLink>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
