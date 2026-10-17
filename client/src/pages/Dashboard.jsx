import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Dashboard() {
  const [groups, setGroups] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  function loadGroups() {
    api.myGroups().then((data) => setGroups(data.groups)).catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadGroups();
    // If the user arrived via a shared invite link, App.jsx stashed the
    // code — pre-fill it here so they just have to hit "Request to join".
    const pending = localStorage.getItem("adashe_pending_code");
    if (pending) {
      setJoinCode(pending);
      localStorage.removeItem("adashe_pending_code");
    }
  }, []);

  async function handleJoin(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await api.joinGroup({ joinCode });
      setMessage(data.message);
      setJoinCode("");
      loadGroups();
    } catch (err) {
      setError(err.message);
    }
  }

  // Bug fix: only count ACTIVE members, not everyone in the array
  // (pending/declined shouldn't inflate the visible member count).
  function activeCount(group) {
    return group.members.filter((m) => m.status === "active").length;
  }

  return (
    <div className="container">
      <div className="eyebrow">Your groups</div>
      <h2>Dashboard</h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <button className="btn btn-primary" onClick={() => navigate("/groups/new")}>
        + Create a group
      </button>

      <form onSubmit={handleJoin} className="card">
        <label>Have a join code or link?</label>
        <input
          placeholder="ADASHE-XXXXXX"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <button className="btn btn-gold" type="submit" style={{ marginBottom: 0 }}>
          Request to join
        </button>
      </form>

      {groups.length === 0 && <p className="small">You're not in any groups yet.</p>}

      {groups.map((g) => (
        <Link key={g._id} to={`/groups/${g._id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{g.name}</strong>
                <div className="small">
                  ₦{g.contributionAmount.toLocaleString()} · {g.frequency} · {activeCount(g)} active member(s)
                </div>
              </div>
              <span className="pill pill-gold">{g.status}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
