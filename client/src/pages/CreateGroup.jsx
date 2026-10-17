import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function CreateGroup() {
  const [form, setForm] = useState({
    name: "",
    contributionAmount: "",
    frequency: "monthly",
    weeklyDueDay: "5", // default Friday
    monthlyDueDay: "1",
    targetMemberCount: "",
    defaultThreshold: "3",
    depositEnabled: false,
    depositMethod: "formula",
    depositAmount: "",
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api.createGroup({
        ...form,
        contributionAmount: Number(form.contributionAmount),
        targetMemberCount: form.targetMemberCount ? Number(form.targetMemberCount) : undefined,
        defaultThreshold: form.defaultThreshold ? Number(form.defaultThreshold) : undefined,
        depositAmount: form.depositAmount ? Number(form.depositAmount) : undefined,
        weeklyDueDay: form.frequency === "weekly" ? Number(form.weeklyDueDay) : undefined,
        monthlyDueDay: form.frequency === "monthly" ? (form.monthlyDueDay === "last" ? "last" : Number(form.monthlyDueDay)) : undefined,
      });
      navigate(`/groups/${data.group._id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <Link to="/" className="small link" style={{ display: "block", marginBottom: 12 }}>← Back to dashboard</Link>
      <div className="eyebrow">New group</div>
      <h2>Create a group</h2>
      <p className="small" style={{ marginBottom: 16 }}>
        Payout order isn't set here — once members have joined, you'll set it on the group page (manually, auto-suggested, or by member preference).
      </p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit} className="card">
        <label>Group name</label>
        <input value={form.name} onChange={(e) => update("name", e.target.value)} required />

        <label>Contribution amount (₦)</label>
        <input
          type="number"
          min="1"
          value={form.contributionAmount}
          onChange={(e) => update("contributionAmount", e.target.value)}
          required
        />

        <label>Frequency</label>
        <select value={form.frequency} onChange={(e) => update("frequency", e.target.value)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>

        {form.frequency === "weekly" ? (
          <>
            <label>Contribution deadline — day of the week</label>
            <select value={form.weeklyDueDay} onChange={(e) => update("weeklyDueDay", e.target.value)}>
              {WEEKDAYS.map((day, i) => (
                <option key={i} value={i}>{day}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label>Contribution deadline — day of the month</label>
            <select value={form.monthlyDueDay} onChange={(e) => update("monthlyDueDay", e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>{day}{day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"}</option>
              ))}
              <option value="last">Last day of the month</option>
            </select>
          </>
        )}

        <label>Target number of members (optional)</label>
        <input
          type="number"
          min="2"
          value={form.targetMemberCount}
          onChange={(e) => update("targetMemberCount", e.target.value)}
          placeholder="e.g. 10 — leave blank for no fixed target"
        />
        <div className="small" style={{ marginTop: -10, marginBottom: 14 }}>
          If set, you'll be asked to confirm before starting the cycle with fewer members than this.
        </div>

        <label>Default warning threshold</label>
        <input
          type="number"
          min="1"
          value={form.defaultThreshold}
          onChange={(e) => update("defaultThreshold", e.target.value)}
        />
        <div className="small" style={{ marginTop: -10, marginBottom: 14 }}>
          After a member misses this many contributions, you'll get a warning notification so you can decide whether to freeze them. This never happens automatically.
        </div>

        <label style={{ marginTop: 6 }}>Security / commitment deposit</label>
        <div
          className="toggle-field"
          onClick={() => update("depositEnabled", !form.depositEnabled)}
        >
          <div className="tf-text">
            <strong>Require a security deposit to participate</strong>
            <span>Members must pay this before making their first contribution. It's a group-agreed commitment amount, refunded once the whole rotation completes.</span>
          </div>
          <div className={`switch ${form.depositEnabled ? "on" : ""}`}></div>
        </div>

        {form.depositEnabled && (
          <div className="deposit-sub">
            <label>How should the deposit amount be calculated?</label>
            <div
              className={`order-option ${form.depositMethod === "formula" ? "selected" : ""}`}
              onClick={() => update("depositMethod", "formula")}
            >
              <div className="radio"></div>
              <div><strong>Scale by payout position</strong><span>First collector pays the full amount (highest remaining risk); last collector pays ₦0. Matches the actual risk each member represents to the group.</span></div>
            </div>
            <div
              className={`order-option ${form.depositMethod === "equal" ? "selected" : ""}`}
              onClick={() => update("depositMethod", "equal")}
            >
              <div className="radio"></div>
              <div><strong>Same amount for everyone</strong><span>Simpler — every member pays the same deposit regardless of when they collect.</span></div>
            </div>

            <label style={{ marginTop: 10 }}>{form.depositMethod === "equal" ? "Deposit amount (₦)" : "Maximum deposit amount (₦)"}</label>
            <input
              type="number"
              min="0"
              value={form.depositAmount}
              onChange={(e) => update("depositAmount", e.target.value)}
              placeholder={form.contributionAmount || "e.g. 5000"}
              style={{ marginBottom: 0 }}
            />
            <div className="hint">
              {form.depositMethod === "equal"
                ? "Every active member pays this exact amount before their first contribution."
                : <>This is the maximum — charged in full to whoever collects <strong>first</strong>, scaling down to <strong>₦0</strong> for whoever collects <strong>last</strong>. Exact amounts are calculated once you finalise the payout order.</>}
              {" "}Members must pay their deposit before making their first contribution. Refunded once the whole group's cycle completes, or forfeited and logged if a member defaults after collecting their own payout.
            </div>
          </div>
        )}

        <button className="btn btn-primary" type="submit" style={{ marginTop: 6 }}>Create group</button>
      </form>
    </div>
  );
}
