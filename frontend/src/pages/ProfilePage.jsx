import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  User,
  Mail,
  Film,
  Heart,
  Users,
  Clock,
  Bell,
  Settings,
  LogOut,
  Camera,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout, getAuthHeaders, checkAuth } = useAuth();
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(user?.name || "");
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, notifRes] = await Promise.all([
        axios.get(`${API}/user/stats`, { headers: getAuthHeaders() }),
        axios.get(`${API}/notifications`, { headers: getAuthHeaders() }),
      ]);
      setStats(statsRes.data);
      setNotifications(notifRes.data.notifications || []);
    } catch (error) {
      console.error("Failed to fetch profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    if (!editName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    try {
      await axios.put(
        `${API}/user/profile`,
        { name: editName },
        { headers: getAuthHeaders() }
      );
      toast.success("Profile updated");
      setEditMode(false);
      await checkAuth();
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  const handleNotificationClick = async (notif) => {
    // Mark as read
    try {
      await axios.put(
        `${API}/notifications/${notif.notification_id}/read`,
        {},
        { headers: getAuthHeaders() }
      );
      
      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.notification_id === notif.notification_id ? { ...n, read: true } : n
        )
      );

      // Navigate if it's a watch party invite
      if (notif.type === "watch_party_invite" && notif.data?.room_id) {
        navigate(`/watch-party/${notif.data.room_id}`);
        setNotifDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const deleteNotification = async (notifId, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/notifications/${notifId}`, {
        headers: getAuthHeaders(),
      });
      setNotifications((prev) =>
        prev.filter((n) => n.notification_id !== notifId)
      );
    } catch (error) {
      toast.error("Failed to delete notification");
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#A1A1AA] mb-4">Please login to view your profile</p>
          <Button onClick={() => navigate("/login")} className="btn-primary">
            Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20 md:pb-8" data-testid="profile-page">
      <div className="max-w-4xl mx-auto px-6 md:px-12 pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl md:text-4xl font-bold">Profile</h1>
          
          {/* Notifications */}
          <Dialog open={notifDialogOpen} onOpenChange={setNotifDialogOpen}>
            <DialogTrigger asChild>
              <button
                data-testid="notifications-btn"
                className="relative w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#7C3AED] text-xs flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[#0A0A0A] border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle>Notifications</DialogTitle>
              </DialogHeader>
              <div className="mt-4 max-h-[400px] overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <p className="text-center text-[#A1A1AA] py-8">
                    No notifications
                  </p>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.notification_id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-4 rounded-lg cursor-pointer transition-all ${
                        notif.read
                          ? "bg-white/5"
                          : "bg-[#7C3AED]/10 border border-[#7C3AED]/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{notif.title}</p>
                          <p className="text-sm text-[#A1A1AA] mt-1">
                            {notif.message}
                          </p>
                          <p className="text-xs text-[#52525B] mt-2">
                            {new Date(notif.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={(e) => deleteNotification(notif.notification_id, e)}
                          className="text-[#A1A1AA] hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Profile Card */}
        <div className="glass rounded-2xl p-8 mb-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-[#7C3AED]"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[#7C3AED] flex items-center justify-center text-3xl font-bold border-4 border-[#7C3AED]/50">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center hover:bg-[#8B5CF6] transition-all">
                <Camera className="w-4 h-4" />
              </button>
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              {editMode ? (
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-black/50 border-white/10 max-w-xs"
                  />
                  <button
                    onClick={updateProfile}
                    className="w-8 h-8 rounded-full bg-[#10B981] flex items-center justify-center hover:bg-[#10B981]/80"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditName(user.name);
                    }}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                  <h2 className="text-2xl font-bold">{user.name}</h2>
                  <button
                    onClick={() => setEditMode(true)}
                    data-testid="edit-name-btn"
                    className="text-[#A1A1AA] hover:text-white"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              )}
              <p className="text-[#A1A1AA] flex items-center gap-2 justify-center md:justify-start">
                <Mail className="w-4 h-4" />
                {user.email}
              </p>
              <p className="text-sm text-[#52525B] mt-2">
                Member since{" "}
                {new Date(user.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div
              className="glass rounded-xl p-6 text-center cursor-pointer hover:bg-white/5 transition-all"
              onClick={() => navigate("/my-list")}
            >
              <Heart className="w-8 h-8 text-[#EF4444] mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.my_list_count}</p>
              <p className="text-sm text-[#A1A1AA]">My List</p>
            </div>
            <div className="glass rounded-xl p-6 text-center">
              <Clock className="w-8 h-8 text-[#F59E0B] mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.continue_watching_count}</p>
              <p className="text-sm text-[#A1A1AA]">In Progress</p>
            </div>
            <div
              className="glass rounded-xl p-6 text-center cursor-pointer hover:bg-white/5 transition-all"
              onClick={() => navigate("/watch-party")}
            >
              <Users className="w-8 h-8 text-[#7C3AED] mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.watch_parties_hosted}</p>
              <p className="text-sm text-[#A1A1AA]">Parties Hosted</p>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-3">
          <button
            onClick={() => navigate("/my-list")}
            data-testid="goto-mylist"
            className="w-full glass rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#EF4444]/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-[#EF4444]" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium">My List</p>
              <p className="text-sm text-[#A1A1AA]">View your saved movies and shows</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/watch-party")}
            data-testid="goto-watchparty"
            className="w-full glass rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#7C3AED]/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#7C3AED]" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium">Watch Party</p>
              <p className="text-sm text-[#A1A1AA]">Watch together with friends</p>
            </div>
          </button>

          <button
            onClick={() => navigate("/browse")}
            data-testid="goto-browse"
            className="w-full glass rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#06B6D4]/20 flex items-center justify-center">
              <Film className="w-5 h-5 text-[#06B6D4]" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium">Browse</p>
              <p className="text-sm text-[#A1A1AA]">Discover new content</p>
            </div>
          </button>

          <button
            onClick={handleLogout}
            data-testid="logout-btn"
            className="w-full glass rounded-xl p-4 flex items-center gap-4 hover:bg-red-500/10 transition-all text-red-500"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium">Logout</p>
              <p className="text-sm opacity-70">Sign out of your account</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
