import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { api, setToken } from "./api";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import VerifyOtp from "./pages/VerifyOtp.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateGroup from "./pages/CreateGroup.jsx";
import GroupDetail from "./pages/GroupDetail.jsx";
import Notifications from "./pages/Notifications.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("adashe_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, setUser, loading };
}

function NavBar({ user, onLogout }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    function poll() {
      api.getNotifications().then((data) => setUnread(data.unreadCount)).catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 30000); // refresh every 30s while the app is open
    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="nav">
      <Link to="/" className="brand">Ada<em>she</em></Link>
      {user ? (
        <div className="nav-links">
          <Link to="/notifications" style={{ position: "relative" }}>
            Notifications
            {unread > 0 && (
              <span className="pill pill-bad" style={{ marginLeft: 5, padding: "1px 7px" }}>{unread}</span>
            )}
          </Link>
          <span className="nav-user">{user.name}</span>
          <ThemeToggle />
          <button className="btn btn-ghost btn-sm" onClick={onLogout} style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)", background: "transparent" }}>
            Log out
          </button>
        </div>
      ) : (
        <div className="nav-links">
          <Link to="/login">Log in</Link>
          <Link to="/register">Register</Link>
          <ThemeToggle />
        </div>
      )}
    </div>
  );
}

function RequireAuth({ user, loading, children }) {
  if (loading) return <div className="container">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, setUser, loading } = useAuth();

  useEffect(() => {
    // If someone opens a shared invite link (?code=ADASHE-XXXX) while logged
    // out, RequireAuth will bounce them to /login before Dashboard ever
    // mounts — so we stash the code here, at the top level, and Dashboard
    // reads + clears it once the user is actually authenticated.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) localStorage.setItem("adashe_pending_code", code);
  }, []);

  function handleLogout() {
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }

  return (
    <BrowserRouter>
      <NavBar user={user} onLogout={handleLogout} />
      <Routes>
        <Route path="/login" element={<Login onLoggedIn={setUser} />} />
        <Route path="/register" element={<Register onLoggedIn={setUser} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-otp" element={<VerifyOtp onLoggedIn={setUser} />} />
        <Route
          path="/"
          element={
            <RequireAuth user={user} loading={loading}>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/new"
          element={
            <RequireAuth user={user} loading={loading}>
              <CreateGroup />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <RequireAuth user={user} loading={loading}>
              <GroupDetail user={user} />
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth user={user} loading={loading}>
              <Notifications />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
