import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const TYPE_LABELS = {
  due_soon: "Reminder",
  overdue: "Overdue",
  approved: "Group approval",
  deposit_refunded: "Deposit refunded",
  deposit_forfeited: "Deposit forfeited",
  payout_confirmed: "Payout confirmed",
  default_warning: "Default warning (organiser)",
  new_rotation: "New rotation started",
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");

  function load() {
    api.getNotifications().then((data) => setNotifications(data.notifications)).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function markRead(id) {
    await api.markNotificationRead(id);
    load();
  }

  async function markAllRead() {
    await api.markAllNotificationsRead();
    load();
  }

  return (
    <div className="container">
      <Link to="/" className="small link" style={{ display: "block", marginBottom: 12 }}>← Back to dashboard</Link>
      <div className="eyebrow">Mock SMS / WhatsApp log</div>
      <h2>Notifications</h2>
      <p className="small" style={{ marginBottom: 16 }}>
        These simulate what would be sent to your phone as SMS/WhatsApp — no real messages are sent (MOCK_PAYMENTS-style mock mode).
      </p>
      {error && <div className="error">{error}</div>}

      {notifications.length > 0 && (
        <button className="btn btn-ghost" onClick={markAllRead}>Mark all as read</button>
      )}

      {notifications.length === 0 && <p className="small">No notifications yet.</p>}

      {notifications.map((n) => (
        <div className="card" key={n._id} style={{ opacity: n.read ? 0.6 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <span className="pill pill-gold">{TYPE_LABELS[n.type] || n.type}</span>
              <span className="small mono" style={{ marginLeft: 8 }}>via {n.channel}</span>
              <p style={{ margin: "8px 0 4px", fontSize: 14 }}>{n.message}</p>
              <span className="small">
                {n.group?.name ? `${n.group.name} · ` : ""}
                {new Date(n.createdAt).toLocaleString()}
              </span>
            </div>
            {!n.read && (
              <button className="btn btn-ghost btn-sm" onClick={() => markRead(n._id)}>Mark read</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
