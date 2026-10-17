import React, { useState } from "react";

export default function PasswordField({ label, value, onChange, autoComplete, required, minLength }) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          style={{ paddingRight: 70 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="small"
          style={{
            position: "absolute", right: 10, top: 12, background: "none", border: "none",
            color: "#1B4C43", fontWeight: 600, cursor: "pointer", padding: 0,
          }}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
