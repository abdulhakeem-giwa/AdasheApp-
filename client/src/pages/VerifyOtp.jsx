import React, { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { api, setToken } from "../api";

export default function VerifyOtp({ onLoggedIn }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userId = location.state?.userId;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mockedCode, setMockedCode] = useState(location.state?.mockedCode || null);

  if (!userId) {
    return (
      <div className="container">
        <div className="error">No account is pending verification. Please register or log in again.</div>
        <Link to="/register" className="small link">Go to register</Link>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api.verifyOtp(userId, code);
      setToken(data.token);
      onLoggedIn(data.user);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleResend() {
    setError("");
    setMessage("");
    try {
      const data = await api.resendOtp(userId);
      setMessage(data.message);
      setMockedCode(data.mocked ? data.otpCode : null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <div className="eyebrow">One more step</div>
      <h2>Verify your account</h2>
      <p className="small" style={{ marginBottom: 20 }}>
        Enter the 6-digit code sent to your email or phone to activate your account.
      </p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {mockedCode && (
        <div className="card" style={{ background: "var(--gold-tint)", borderColor: "var(--gold)" }}>
          <span className="pill pill-gold">MOCK MODE — no real message sent</span>
          <p className="small" style={{ margin: "10px 0 0" }}>
            No SMTP/SMS is configured for this test environment, so here's your code directly: <strong className="mono">{mockedCode}</strong>
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        <label>Verification code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          required
        />
        <button className="btn btn-primary" type="submit">Verify &amp; continue</button>
        <button type="button" className="btn btn-ghost" onClick={handleResend} style={{ marginBottom: 0 }}>
          Resend code
        </button>
      </form>
    </div>
  );
}
