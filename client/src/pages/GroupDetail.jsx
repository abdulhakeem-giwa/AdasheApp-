import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, downloadLedgerPdf } from "../api";
import RotationWheel from "../components/RotationWheel.jsx";
import ShareInvite from "../components/ShareInvite.jsx";

export default function GroupDetail({ user }) {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [orderDraft, setOrderDraft] = useState([]);
  const [confirmStart, setConfirmStart] = useState(null); // { activeCount, targetMemberCount } when blocked
  const [inviteForm, setInviteForm] = useState({ email: "", phone: "" });

  const load = useCallback(() => {
    api
      .getGroup(id)
      .then((data) => {
        setGroup(data.group);
        const activeIds = data.group.members
          .filter((m) => m.status === "active")
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          .map((m) => m.user._id || m.user);
        setOrderDraft(activeIds);
      })
      .catch((e) => setError(e.message));
    api
      .getLedger(id)
      .then((data) => {
        setRounds(data.rounds);
        setTransactions(data.transactions);
      })
      .catch(() => {});
  }, [id]);

  useEffect(load, [load]);

  // Auto-refresh: if another member pays or the organiser takes an action
  // while this page is open, reflect it without requiring a manual browser
  // reload. Same lightweight polling pattern as the notification bell.
  useEffect(() => {
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const [mockPayments, setMockPayments] = useState(false);
  useEffect(() => {
    api.getConfig().then((c) => setMockPayments(c.mockPayments)).catch(() => {});
  }, []);

  if (error) return <div className="container"><div className="error">{error}</div></div>;
  if (!group) return <div className="container">Loading...</div>;

  const isOrganiser = group.organiser === user.id || group.organiser?._id === user.id;
  const me = group.members.find((m) => m.user && (m.user._id || m.user) === user.id);
  const pending = group.members.filter((m) => m.status === "pending");
  const invited = group.members.filter((m) => m.status === "invited");
  const active = group.members.filter((m) => m.status === "active");
  const openRound = rounds.find((r) => r.status === "open");
  const currentRecipientId = openRound ? (openRound.recipient?._id || openRound.recipient) : null;
  // The pot is what has actually been collected for the current round. When the
  // organiser confirms a payout the next round opens and the pot starts again
  // from zero; after the final payout there is no open round, so it shows zero.
  const potAmount = openRound ? openRound.collectedAmount || 0 : 0;
  const potTarget = openRound ? openRound.expectedAmount || group.contributionAmount * active.length : 0;

  async function act(fn, ...args) {
    setError("");
    setMessage("");
    try {
      const res = await fn(...args);
      setMessage(res.message || "Done");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Contribute needs special handling: if Paystack returns a real
  // authorization_url (live mode, not mocked), we must redirect the
  // member there to actually complete payment — previously this just
  // showed a message and silently did nothing in live mode.
  // Confirming a payout: if the pot is not full the server says so, and the
  // organiser can choose to pay out what has been collected so far.
  async function handleConfirmPayout(roundId) {
    setError("");
    setMessage("");
    try {
      const res = await api.confirmPayout(group._id, roundId);
      setMessage(res.message || "Payout confirmed");
      load();
    } catch (err) {
      if (err.data && err.data.partialPossible) {
        const ok = window.confirm(`${err.message}\n\nPay out only the collected amount?`);
        if (!ok) return;
        try {
          const res = await api.confirmPayout(group._id, roundId, true);
          setMessage(res.message || "Partial payout confirmed");
          load();
        } catch (err2) {
          setError(err2.message);
        }
        return;
      }
      setError(err.message);
    }
  }

  async function handleContribute(roundId) {
    setError("");
    setMessage("");
    try {
      const res = await api.contribute(group._id, roundId);
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
        return; // navigating away
      }
      setMessage(res.message || "Contribution recorded");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeposit() {
    setError("");
    setMessage("");
    try {
      const res = await api.payDeposit(group._id);
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
        return;
      }
      setMessage("Deposit recorded");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSuggestOrder() {
    setError("");
    try {
      const res = await api.suggestOrder(group._id);
      setOrderDraft(res.suggestedOrder);
      setMessage("Suggested order filled in below — review and adjust before finalising.");
    } catch (err) {
      setError(err.message);
    }
  }

  // One-click version: suggest + finalise immediately, no review step.
  // Still an explicit organiser action (they press the button) — it just
  // skips the manual drag-and-drop when the group has already agreed on
  // an order elsewhere (e.g. in their WhatsApp chat).
  // Genuine random shuffle — a third option alongside manual and
  // suggest-by-join-order/preference, for organisers who'd rather not
  // negotiate order socially and just want it decided arbitrarily.
  function handleRandomShuffle() {
    setOrderDraft((prev) => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
    setMessage("Order randomly shuffled below — review and adjust before finalising.");
  }

  async function handleAutoStartNow() {
    setError("");
    setMessage("");
    try {
      const suggestRes = await api.suggestOrder(group._id);
      await api.setOrder(group._id, suggestRes.suggestedOrder);
      setMessage("Order auto-generated and schedule started.");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function myRoundStatus(userId) {
    if (!openRound) return null;
    const txn = transactions.find(
      (t) => t.round === openRound._id && (t.member._id || t.member) === userId && t.type === "contribution"
    );
    return txn ? txn.status : null;
  }

  async function handleFinaliseOrder(forceStart = false) {
    setError("");
    setMessage("");
    setConfirmStart(null);
    try {
      const res = await api.setOrder(group._id, orderDraft, forceStart);
      setMessage(res.message || "Done");
      load();
    } catch (err) {
      // The backend signals this specific case with requiresConfirmation
      // so we can offer "start anyway" instead of just showing a dead-end error.
      if (err.message && err.message.includes("target is")) {
        const match = err.message.match(/target is (\d+) members, but only (\d+)/);
        setConfirmStart({
          targetMemberCount: match ? Number(match[1]) : group.targetMemberCount,
          activeCount: match ? Number(match[2]) : active.length,
        });
        setError(err.message);
      } else {
        setError(err.message);
      }
    }
  }

  async function handleInviteByContact(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const res = await api.inviteByContact(group._id, inviteForm);
      setMessage(res.message);
      setInviteForm({ email: "", phone: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function moveInOrder(userId, direction) {
    setOrderDraft((prev) => {
      const idx = prev.indexOf(userId);
      const next = [...prev];
      const swap = idx + direction;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  async function handleStartNewRotation() {
    setError("");
    setMessage("");
    try {
      const res = await api.startNewRotation(group._id);
      setMessage(res.message || "New rotation started.");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <Link to="/" className="small link" style={{ display: "block", marginBottom: 12 }}>← Back to dashboard</Link>
      <div className="eyebrow">{group.status}</div>
      <h2>{group.name}</h2>
      <p className="small" style={{ marginBottom: 16 }}>
        ₦{group.contributionAmount.toLocaleString()} · {group.frequency} · {active.length} active member(s)
      </p>

      {isOrganiser && (
        <button
          className="btn btn-ghost"
          style={{ marginBottom: 16 }}
          onClick={() => act(api.freezeGroup, group._id, group.status === "paused" ? "unfreeze" : "freeze")}
        >
          {group.status === "paused" ? "Resume group" : "Freeze entire group"}
        </button>
      )}

      {/* Persistent, unmissable banner for a frozen member — not just a contextual note */}
      {me?.frozen && (
        <div className="error" style={{ fontWeight: 600 }}>
          Your membership in this group is currently frozen by the organiser. You can't make contributions until it's lifted — contact the organiser if you're not sure why.
        </div>
      )}

      {isOrganiser && group.status === "completed" && (
        <div className="card" style={{ background: "var(--gold-tint)", borderColor: "var(--gold)" }}>
          <h3 style={{ fontSize: 15 }}>Rotation completed 🎉</h3>
          <p className="small">Every member has now received their payout. Start a new rotation reusing the same members, order, and rules?</p>
          <button className="btn btn-gold" onClick={handleStartNewRotation}>Start new rotation</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {/* Rotation wheel — only meaningful once the schedule exists */}
      {group.orderFinalised && active.length > 0 && (
        <div className="card-dark">
          <RotationWheel members={active} currentRecipientId={currentRecipientId} potAmount={potAmount} potTarget={potTarget} />
          {openRound && (
            <div className="wheel-meta">
              <span>Round <strong>{openRound.roundNumber}</strong> of {rounds.length}</span>
              <span>Due <strong>{new Date(openRound.dueDate).toLocaleDateString()}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Join code + share */}
      <ShareInvite joinCode={group.joinCode} groupName={group.name} />
      <p className="small" style={{ marginTop: -10, marginBottom: 16 }}>
        Note: WhatsApp/SMS text will work anywhere; the Facebook/link preview only works once this app is deployed to a public URL (not localhost).
      </p>

      {/* Organiser: invite a specific person by contact, as an alternative/addition to the open code */}
      {isOrganiser && !group.orderFinalised && (
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Invite a specific person</h3>
          <p className="small">
            Know exactly who you want in this group? Invite them by email or phone — only that exact contact can fill this slot, which is a stronger check than the open join code above.
          </p>
          <form onSubmit={handleInviteByContact} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder="Email (optional)"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              style={{ flex: "1 1 160px", marginBottom: 0 }}
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={inviteForm.phone}
              onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
              style={{ flex: "1 1 160px", marginBottom: 0 }}
            />
            <button className="btn btn-gold" type="submit" style={{ margin: 0, width: "auto", padding: "12px 18px" }}>
              Invite
            </button>
          </form>

          {invited.length > 0 && (
            <>
              <div className="section-header" style={{ marginTop: 16 }}>
                <span className="small" style={{ fontWeight: 600 }}>Invited, awaiting registration ({invited.length})</span>
              </div>
              {invited.map((m, i) => (
                <div className="row" key={i}>
                  <span className="small">{m.invitedEmail || m.invitedPhone}</span>
                  <span className="pill pill-gold">Waiting</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Organiser: pending approvals */}
      {isOrganiser && pending.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Pending approval ({pending.length})</h3>
          {pending.map((m) => (
            <div className="row" key={m.user._id || m.user}>
              <div>
                <span>{m.user.name || m.user}</span>
                <div className="small">{m.user.email || m.user.phone || "No contact on file"}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => act(api.reviewMember, group._id, m.user._id || m.user, "approve")}
                >
                  Approve
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => act(api.reviewMember, group._id, m.user._id || m.user, "decline")}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Organiser: set payout order */}
      {isOrganiser && !group.orderFinalised && (
        <div className="card">
          <div className="section-header">
            <h3 style={{ fontSize: 15 }}>Set payout order</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={handleSuggestOrder}>Auto-suggest</button>
              <button className="btn btn-ghost btn-sm" onClick={handleRandomShuffle}>Shuffle randomly</button>
              <button className="btn btn-gold btn-sm" onClick={handleAutoStartNow}>Use auto order &amp; start now</button>
            </div>
          </div>
          <p className="small">
            Already agreed the order in your group chat? "Use auto order &amp; start now" applies it and starts the schedule immediately. Otherwise, reorder members below and finalise manually.
          </p>
          {group.targetMemberCount && (
            <p className="small" style={{ fontWeight: 600 }}>
              {active.length} of {group.targetMemberCount} target members joined
            </p>
          )}
          {orderDraft.map((uid, idx) => {
            const m = active.find((x) => (x.user._id || x.user) === uid);
            const pref = m?.memberRequestedSlot;
            return (
              <div className="row" key={uid}>
                <span>
                  {idx + 1}. {m?.user?.name || uid}
                  {pref != null && <span className="small" style={{ marginLeft: 6 }}>(requested slot {pref})</span>}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => moveInOrder(uid, -1)}>↑</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => moveInOrder(uid, 1)}>↓</button>
                </div>
              </div>
            );
          })}
          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => handleFinaliseOrder(false)}
          >
            Finalise order &amp; generate schedule
          </button>
          {confirmStart && (
            <div className="deposit-sub" style={{ marginTop: 10 }}>
              <p className="small" style={{ marginBottom: 10 }}>
                Only {confirmStart.activeCount} of your target {confirmStart.targetMemberCount} members have joined. Start the cycle anyway with just these {confirmStart.activeCount}?
              </p>
              <button className="btn btn-gold" style={{ marginBottom: 0 }} onClick={() => handleFinaliseOrder(true)}>
                Start anyway with {confirmStart.activeCount} member(s)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Member: submit a preferred slot before the order is finalised (always available now — no upfront mode choice) */}
      {!isOrganiser && !group.orderFinalised && (
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Request a payout slot</h3>
          <p className="small">Let the organiser know which round you'd prefer to collect in.</p>
          <PreferenceForm
            current={me?.memberRequestedSlot}
            max={active.length}
            onSubmit={(slot) => act(api.submitPreference, group._id, slot)}
          />
        </div>
      )}

      {/* Security deposit — amount is per-member (position-based) and only known once order is finalised */}
      {group.depositEnabled && me && group.orderFinalised && !me.depositPaid && !me.depositRefunded && !me.depositForfeited && (
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Security deposit required</h3>
          {me.depositAmount > 0 ? (
            <>
              <p className="small">
                ₦{me.depositAmount.toLocaleString()} — {group.depositMethod === "equal" ? "the same amount every member pays" : "based on your payout position"}, agreed on by the group. You must pay this before making your first contribution. Refunded once the <strong>whole group's</strong> cycle completes (the organiser confirms the very last payout), not just your own contributions.
              </p>
              <button className="btn btn-gold" onClick={handleDeposit}>Pay security deposit</button>
            </>
          ) : (
            <p className="small">Your payout position carries no remaining risk to the group (you collect last), so no deposit is required from you.</p>
          )}
        </div>
      )}
      {group.depositEnabled && me && !group.orderFinalised && (
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Security deposit</h3>
          <p className="small">This group requires a security deposit before you can contribute. Your exact amount will be shown here once the organiser finalises the payout order — it depends on your position in the rotation.</p>
        </div>
      )}

      {/* Members management panel — the organiser's at-a-glance view */}
      {isOrganiser && active.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15 }}>Members</h3>
          {active.map((m) => {
            const uid = m.user._id || m.user;
            const status = myRoundStatus(uid);
            const initials = (m.user.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div className="member-row" key={uid}>
                <div className="av">{initials}</div>
                <div className="info">
                  <strong>{m.user.name}{uid === user.id ? " (you)" : ""}</strong>
                  <div className="meta">
                    {status && (
                      <span className={`pill ${status === "success" ? "pill-ok" : status === "overdue" ? "pill-bad" : "pill-gold"}`}>
                        {status === "success" ? "Paid this round" : status === "overdue" ? "Overdue" : "Pending"}
                      </span>
                    )}
                    {group.depositEnabled && (
                      <span className={`pill ${m.depositForfeited ? "pill-bad" : m.depositRefunded ? "pill-ok" : m.depositPaid ? "pill-gold" : "pill-gold"}`}>
                        {m.depositForfeited
                          ? `Security deposit forfeited (₦${(m.depositAmount || 0).toLocaleString()})`
                          : m.depositRefunded
                          ? `Security deposit refunded (₦${(m.depositAmount || 0).toLocaleString()})`
                          : m.depositPaid
                          ? `Security deposit held (₦${(m.depositAmount || 0).toLocaleString()})`
                          : group.orderFinalised
                          ? `Security deposit due: ₦${(m.depositAmount || 0).toLocaleString()}`
                          : "Security deposit: TBD"}
                      </span>
                    )}
                    <span className={`pill ${m.user.trustScore >= 70 ? "pill-ok" : m.user.trustScore >= 40 ? "pill-gold" : "pill-bad"}`}>
                      Trust: {m.user.trustScore}
                    </span>
                    {m.user.defaultCount > 0 && (
                      <span className="pill pill-bad">{m.user.defaultCount} past default(s)</span>
                    )}
                    {m.frozen && <span className="pill pill-frozen">Frozen</span>}
                  </div>
                </div>
                {uid !== user.id && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => act(api.freezeMember, group._id, uid, m.frozen ? "unfreeze" : "freeze")}
                  >
                    {m.frozen ? "Unfreeze" : "Freeze"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rounds */}
      <div className="card">
        <h3 style={{ fontSize: 15 }}>Rounds</h3>
        {rounds.length === 0 && <p className="small">Schedule not generated yet.</p>}
        {rounds.map((r) => {
          const myTxn = transactions.find(
            (t) => t.round === r._id && (t.member._id || t.member) === user.id && t.type === "contribution"
          );
          return (
            <div key={r._id} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>Round {r.roundNumber}</strong>
                <span className="small">Due {new Date(r.dueDate).toLocaleDateString()}</span>
              </div>
              <div className="small">Recipient: {r.recipient?.name || r.recipient}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                {myTxn && (
                  <span className={`pill ${myTxn.status === "success" ? "pill-ok" : myTxn.status === "overdue" ? "pill-bad" : "pill-gold"}`}>
                    You: {myTxn.status}
                  </span>
                )}
                {myTxn && myTxn.status === "pending" && r.status === "open" && openRound && openRound._id === r._id && !me?.frozen && group.status !== "paused" && (
                  group.depositEnabled && me?.depositAmount > 0 && !me?.depositPaid ? (
                    <span className="pill pill-gold">Pay your security deposit first</span>
                  ) : (
                    <>
                      <button className="btn btn-gold btn-sm" onClick={() => handleContribute(r._id)}>
                        Contribute ₦{group.contributionAmount.toLocaleString()}
                      </button>
                      {mockPayments && (
                        <span className="small mono" title="MOCK_PAYMENTS=true — this instantly marks as paid, no real Paystack checkout appears">
                          (test mode — no real payment screen)
                        </span>
                      )}
                    </>
                  )
                )}
                {myTxn && myTxn.status === "pending" && (me?.frozen || group.status === "paused") && (
                  <span className="pill pill-frozen">
                    {group.status === "paused" ? "Group frozen" : "You are frozen"}
                  </span>
                )}
                {isOrganiser && !r.payoutConfirmed && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleConfirmPayout(r._id)}>
                    Confirm payout
                  </button>
                )}
                {isOrganiser && (
                  <button className="btn btn-ghost btn-sm" onClick={() => act(api.checkOverdue, group._id, r._id)}>
                    Check overdue
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full ledger */}
      <div className="card">
        <div className="section-header">
          <h3 style={{ fontSize: 15 }}>Ledger</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                await downloadLedgerPdf(group._id, group.name);
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Download PDF
          </button>
        </div>
        {transactions.length === 0 && <p className="small">No transactions yet.</p>}
        {transactions.map((t) => (
          <div className="row" key={t._id}>
            <div>
              <strong>{t.member.name || t.member}</strong>
              <div className="small mono" style={{ textTransform: "capitalize" }}>{t.type.replace("_", " ")}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono">₦{t.amount.toLocaleString()}</div>
              <span className={`pill ${t.type === "deposit_forfeit" ? "pill-bad" : t.status === "success" ? "pill-ok" : t.status === "overdue" ? "pill-bad" : "pill-gold"}`}>
                {t.type === "deposit_forfeit" ? "forfeited" : t.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreferenceForm({ current, max, onSubmit }) {
  const [slot, setSlot] = useState(current || "");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="number"
        min="1"
        max={max}
        value={slot}
        onChange={(e) => setSlot(e.target.value)}
        placeholder={`1–${max}`}
        style={{ marginBottom: 0 }}
      />
      <button
        className="btn btn-gold"
        style={{ margin: 0, width: "auto", padding: "12px 18px" }}
        onClick={() => onSubmit(Number(slot))}
      >
        Submit
      </button>
    </div>
  );
}
