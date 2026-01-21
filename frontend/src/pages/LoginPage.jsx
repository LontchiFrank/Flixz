import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Mail, Lock, Sparkles, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check if redirecting to watch party
  const params = new URLSearchParams(location.search);
  const redirectPath = params.get('redirect');
  const isWatchPartyRedirect = redirectPath && redirectPath.includes('/watch-party/');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/login`, { email, password });
      login(res.data.user, res.data.access_token);
      toast.success("Welcome back!");

      // Redirect to intended destination or browse
      const params = new URLSearchParams(location.search);
      const redirectTo = params.get('redirect') || location.state?.from || '/browse';
      navigate(redirectTo);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const params = new URLSearchParams(location.search);
    const intendedPath = params.get('redirect') || location.state?.from || '/browse';
    const redirectUrl = window.location.origin + intendedPath;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div
      className="min-h-screen bg-[#050505] flex items-center justify-center px-6"
      data-testid="login-page"
    >
      {/* Background Effect */}
      <div className="absolute inset-0 purple-haze opacity-30" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Welcome to Flixzbox</h1>
          <p className="text-[#A1A1AA] mt-2">Sign in to continue</p>
        </div>

        {/* Watch Party Invitation Notice */}
        {isWatchPartyRedirect && (
          <div className="mb-4 p-4 rounded-lg bg-[#7C3AED]/10 border border-[#7C3AED]/30">
            <p className="text-sm text-center">
              <span className="text-[#7C3AED] font-semibold">🎬 You've been invited to a watch party!</span>
              <br />
              <span className="text-[#A1A1AA]">Sign in to join the party</span>
            </p>
          </div>
        )}

        {/* Form */}
        <div className="glass rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm text-[#A1A1AA]">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#52525B]" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  data-testid="email-input"
                  className="pl-10 bg-black/50 border-white/10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#A1A1AA]">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#52525B]" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  data-testid="password-input"
                  className="pl-10 pr-10 bg-black/50 border-white/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525B] hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-btn"
              className="w-full btn-primary"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[#0A0A0A] text-[#52525B]">or</span>
            </div>
          </div>

          <Button
            onClick={handleGoogleLogin}
            variant="outline"
            data-testid="google-login-btn"
            className="w-full bg-white/5 border-white/10 hover:bg-white/10"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-sm text-[#A1A1AA] mt-6">
            Don't have an account?{" "}
            <Link
              to="/register"
              data-testid="register-link"
              className="text-[#7C3AED] hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
