import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import PasswordField from "../components/PasswordField.jsx";
import PasswordStrength, { isPasswordStrong } from "../components/PasswordStrength.jsx";

export default function Register({ onLoggedIn }) {
  // "email" or "phone" — market traders and others without a smartphone
  // email can register with just a phone number instead.
  const [method, setMethod] = useState("email");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!isPasswordStrong(form.password)) {
      setError("Please meet all the password requirements below before continuing.");
      return;
    }
    try {
      const payload = {
        name: form.name,
        password: form.password,
        email: method === "email" ? form.email : undefined,
        phone: method === "phone" ? form.phone : undefined,
      };
      const data = await api.register(payload);
      // No longer logs in directly — the account must be verified with a
      // one-time code first (see VerifyOtp.jsx). In mock mode, the code is
      // returned directly so it's testable without a real inbox/SMS.
      navigate("/verify-otp", { state: { userId: data.userId, mockedCode: data.mocked ? data.otpCode : null } });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <div className="eyebrow">Get started</div>
      <h2>Create an account</h2>
      <p className="small" style={{ marginBottom: 20 }}>Set up your contribution groups in minutes.</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit} className="card">
        <label>Full name</label>
        <input value={form.name} onChange={(e) => update("name", e.target.value)} required autoComplete="name" />

        <label>Register with</label>
        <div className="seg" style={{ display: "flex", border: "1.5px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setMethod("email")}
            style={{
              flex: 1, border: "none", padding: 11, fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: method === "email" ? "var(--forest)" : "#fff", color: method === "email" ? "#fff" : "var(--muted)",
            }}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setMethod("phone")}
            style={{
              flex: 1, border: "none", padding: 11, fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: method === "phone" ? "var(--forest)" : "#fff", color: method === "phone" ? "#fff" : "var(--muted)",
            }}
          >
            Phone number
          </button>
        </div>

        {method === "email" ? (
          <>
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              autoComplete="email"
              required
            />
          </>
        ) : (
          <>
            <label>Phone number</label>
            <input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              autoComplete="tel"
              placeholder="e.g. 08012345678"
              required
            />
            <p className="small" style={{ marginTop: -10, marginBottom: 14 }}>
              Note: password reset currently requires an email. Without one, keep your password safe — see your organiser/support if you get locked out.
            </p>
          </>
        )}

        <PasswordField
          label="Password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          autoComplete="new-password"
          required
        />
        <div style={{ marginTop: 10 }}>
          <PasswordStrength password={form.password} />
        </div>
        <button className="btn btn-primary" type="submit">Create account</button>
      </form>
    </div>
  );
}
