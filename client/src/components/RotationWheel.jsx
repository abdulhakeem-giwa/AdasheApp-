import React from "react";

/**
 * The signature visual from the design prototype, now driven by real data.
 * members: array of { user: { _id, name }, order } — active members, any order
 * currentRecipientId: the user id of whoever collects the current round
 * potAmount: number to show in the centre
 */
export default function RotationWheel({ members, currentRecipientId, potAmount, potTarget }) {
  const R = 82;
  const cx = 100, cy = 100;

  const sorted = [...members].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  return (
    <div>
      <div className="wheel-pot-headline">
        <span className="wheel-pot-label">Collected this round</span>
        <span className="wheel-pot-amount">₦{(potAmount || 0).toLocaleString()}</span>
        {potTarget > 0 && (
          <span className="wheel-pot-label">of ₦{potTarget.toLocaleString()} expected</span>
        )}
      </div>
      <div className="wheel-holder">
        <div className="wheel">
          {sorted.map((m, i) => {
            const angle = (i / sorted.length) * 2 * Math.PI - Math.PI / 2;
            const x = cx + R * Math.cos(angle) - 18;
            const y = cy + R * Math.sin(angle) - 18;
            const id = m.user._id || m.user;
            const isCurrent = id === currentRecipientId;
            const initials = (m.user.name || "?")
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <div
                key={id}
                className={`avatar ${isCurrent ? "current" : ""}`}
                style={{ left: x, top: y }}
                title={m.user.name}
              >
                {initials}
              </div>
            );
          })}
          <div className="pot-center">
            <div className="lbl">Pot</div>
          </div>
        </div>
      </div>
    </div>
  );
}
