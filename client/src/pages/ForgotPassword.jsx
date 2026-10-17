import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    try {
      const data = await api.forgotPassword(identifier);
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(result.resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="container">
      <div className="eyebrow">Reset your password</div>
      <h2>Forgot password</h2>
      <p className="small" style={{ marginBottom: 20 }}>Enter the email on your account and we'll send reset instructions.</p>
      {error && <div className="error">{error}</div>}

      {!result && (
        <form onSubmit={handleSubmit} className="card">
          <label>Email address</label>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="email" required />
          <button className="btn btn-primary" type="submit">Send reset instructions</button>
        </form>
      )}

      {result && !result.mocked && (
        <div className="success">{result.message}</div>
      )}

      {result && result.mocked && (
        <div className="card" style={{ background: "var(--gold-tint)", borderColor: "var(--gold)" }}>
          <span className="pill pill-gold">MOCK MODE — no real email sent</span>
          <p className="small" style={{ margin: "10px 0" }}>
            No SMTP is configured for this test environment, so here's the reset link directly (in production this would arrive by email):
          </p>
          <div className="mono small" style={{ wordBreak: "break-all", background: "var(--paper)", padding: 10, borderRadius: 8, marginBottom: 10 }}>
            {result.resetLink}
          </div>
          <button className="btn btn-gold" onClick={copyLink}>{copied ? "Copied ✓" : "Copy link"}</button>
          <a href={result.resetLink} className="btn btn-ghost" style={{ textAlign: "center" }}>Open link</a>
        </div>
      )}

      <Link to="/login" className="small link" style={{ display: "block", marginTop: 16 }}>← Back to login</Link>
    </div>
  );
}
