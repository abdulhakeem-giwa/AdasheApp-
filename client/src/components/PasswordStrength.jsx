import React from "react";

// Mirrors server/utils/passwordPolicy.js — 8+ chars, upper, lower, number, symbol.
export function checkPasswordRules(password) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordStrong(password) {
  const r = checkPasswordRules(password);
  return r.length && r.upper && r.lower && r.number && r.symbol;
}

export default function PasswordStrength({ password }) {
  const rules = checkPasswordRules(password);
  const metCount = Object.values(rules).filter(Boolean).length;

  let level = "weak";
  if (metCount >= 5) level = "strong";
  else if (metCount >= 3) level = "fair";

  return (
    <div>
      <div className="strength-bar">
        <div className={`seg ${metCount >= 1 ? "on-" + level : ""}`}></div>
        <div className={`seg ${metCount >= 3 ? "on-" + level : ""}`}></div>
        <div className={`seg ${metCount >= 5 ? "on-" + level : ""}`}></div>
      </div>
      <ul className="strength-list">
        <li className={rules.length ? "met" : ""}><span className="dot"></span>At least 8 characters</li>
        <li className={rules.upper ? "met" : ""}><span className="dot"></span>An uppercase letter</li>
        <li className={rules.lower ? "met" : ""}><span className="dot"></span>A lowercase letter</li>
        <li className={rules.number ? "met" : ""}><span className="dot"></span>A number</li>
        <li className={rules.symbol ? "met" : ""}><span className="dot"></span>A symbol (e.g. ! @ # $)</li>
      </ul>
    </div>
  );
}
