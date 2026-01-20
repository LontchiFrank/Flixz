import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Film, Tv, Search, User } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const MobileNav = () => {
  const { user } = useAuth();

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Film, label: "Movies", path: "/browse/movies" },
    { icon: Tv, label: "TV", path: "/browse/tv" },
    { icon: Search, label: "Search", path: "/search" },
    { icon: User, label: user ? "Profile" : "Login", path: user ? "/my-list" : "/login" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 bg-black/95 border-t border-white/5 flex items-center justify-around z-50 backdrop-blur-xl md:hidden"
      data-testid="mobile-nav"
    >
      {navItems.map(({ icon: Icon, label, path }) => (
        <NavLink
          key={path}
          to={path}
          data-testid={`mobile-nav-${label.toLowerCase()}`}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all ${
              isActive
                ? "text-[#7C3AED]"
                : "text-[#A1A1AA]"
            }`
          }
        >
          <Icon className="w-5 h-5" />
          <span className="text-xs">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileNav;
