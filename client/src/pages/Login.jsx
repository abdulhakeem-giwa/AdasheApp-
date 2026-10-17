import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import PasswordField from "../components/PasswordField.jsx";

export default function Login({ onLoggedIn }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api.login(identifier, password);
      setToken(data.token);
      onLoggedIn(data.user);
      navigate("/");
    } catch (err) {
      if (err.data?.requiresVerification) {
        navigate("/verify-otp", { state: { userId: err.data.userId, mockedCode: err.data.mocked ? err.data.otpCode : null } });
        return;
      }
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <div className="eyebrow">Welcome back</div>
      <h2>Log in</h2>
      <p className="small" style={{ marginBottom: 20 }}>Get back to your Adashe groups.</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit} className="card">
        <label>Email or phone number</label>
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          name="identifier"
          required
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button className="btn btn-primary" type="submit" style={{ marginTop: 14 }}>Log in</button>
        <Link to="/forgot-password" className="small link" style={{ display: "block", textAlign: "center", marginTop: 6 }}>
          Forgot password?
        </Link>
      </form>
    </div>
  );
}
