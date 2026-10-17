import React, { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import PasswordField from "../components/PasswordField.jsx";
import PasswordStrength, { isPasswordStrong } from "../components/PasswordStrength.jsx";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!isPasswordStrong(password)) {
      setError("Please meet all the password requirements below.");
      return;
    }
    try {
      await api.resetPassword(id, token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!id || !token) {
    return (
      <div className="container">
        <div className="error">This reset link is missing required information. Please request a new one.</div>
        <Link to="/forgot-password" className="link">Request a new link</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="eyebrow">Almost done</div>
      <h2>Set a new password</h2>
      {error && <div className="error">{error}</div>}
      {done ? (
        <div className="success">Password reset! Redirecting you to log in...</div>
      ) : (
        <form onSubmit={handleSubmit} className="card">
          <PasswordField
            label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <div style={{ marginTop: 10 }}>
            <PasswordStrength password={password} />
          </div>
          <button className="btn btn-primary" type="submit">Reset password</button>
        </form>
      )}
      <Link to="/login" className="small link" style={{ display: "block", marginTop: 16 }}>← Back to login</Link>
    </div>
  );
}
