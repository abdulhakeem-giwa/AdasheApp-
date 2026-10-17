import React, { useState } from "react";

export default function ShareInvite({ joinCode, groupName }) {
  const [copied, setCopied] = useState(false);

  const inviteLink = `${window.location.origin}/?code=${encodeURIComponent(joinCode)}`;
  const message = `Join "${groupName}" on Adashe! Use code ${joinCode} or tap this link: ${inviteLink}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers/insecure contexts where clipboard API is unavailable.
      window.prompt("Copy this link:", inviteLink);
    }
  }

  function openShare(url) {
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
  }

  return (
    <div className="code-card">
      <div className="small" style={{ color: "rgba(255,255,255,.6)" }}>GROUP JOIN CODE</div>
      <div className="code">{joinCode}</div>
      <div className="share-row">
        <button className="share-btn copy" onClick={handleCopy}>
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <button
          className="share-btn whatsapp"
          onClick={() => openShare(`https://wa.me/?text=${encodeURIComponent(message)}`)}
        >
          WhatsApp
        </button>
        <button
          className="share-btn facebook"
          onClick={() =>
            openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteLink)}`)
          }
        >
          Facebook
        </button>
        <button
          className="share-btn sms"
          onClick={() => (window.location.href = `sms:?body=${encodeURIComponent(message)}`)}
        >
          Text (SMS)
        </button>
      </div>
    </div>
  );
}
