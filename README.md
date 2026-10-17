# Digital Contribution/Asusu/Adashe System — Working MVP

This is a functional MERN implementation of the system designed in your proposal
and Chapters 1–3: organiser-controlled scheduling, a shared digital ledger,
default-tracking, an optional refundable deposit, invite/approval flow, and
Paystack test-mode payment collection.

```
adashe-app/
  server/   ← Express + MongoDB REST API
  client/   ← React (Vite) frontend
```

This code was written and syntax-checked in a sandboxed environment without
internet access, so it has **not** been run end-to-end yet. Follow the steps
below on your own machine to install dependencies, connect a real database,
and test it properly before you rely on it for your defense demo.

---

## 0. What changed since you last tested this (read this first)

Based on your testing feedback, five things were fixed:

1. **Invite sharing** — the group page now has a "Copy link" button plus one-tap share to WhatsApp, Facebook, and SMS. The link format is `yourapp.com/?code=ADASHE-XXXX` — opening it pre-fills the join code automatically, even if the person has to log in/register first.
   ⚠️ WhatsApp/SMS sharing works from anywhere. Facebook's link preview and anyone clicking the link from outside your machine will only work once the app is deployed to a real public URL — `localhost` links only work on your own computer.

2. **Member count bug — fixed.** The Dashboard was counting every member in the group (including pending/declined) instead of just active ones. It now filters to `status === "active"` everywhere a count is shown.

3. **Paystack — a real bug was found and fixed.** The backend always genuinely implemented Paystack (real transaction init + signature-verified webhooks), but the frontend never redirected members to Paystack's actual checkout page when a real `authorization_url` came back — it just showed a message and did nothing. That's fixed now. **`MOCK_PAYMENTS=true` is still the recommended default** for your defense — see Section 6 below for switching to live test mode later.

4. **Stronger passwords.** Registration now requires 8+ characters with an uppercase letter, lowercase letter, number, and symbol — enforced on **both** the frontend (a live strength meter as you type) and the backend (so it can't be bypassed by calling the API directly).

5. **UI/UX now matches the design prototype** — same forest-green/gold color palette, Fraunces/Inter/IBM Plex Mono fonts, and the live rotation wheel is now a real component driven by actual group data (not a static mockup).

---

## 0b. Organiser dashboard additions (member management, freeze, auto-suggest order)

1. **Members panel** — the organiser now sees a dedicated list of active members on the group page: current-round payment status, deposit status, historical default count, and frozen status, all at a glance (this data existed in the ledger before, just wasn't summarised anywhere).

2. **Freeze — both levels, as agreed:**
   - **Freeze entire group** (button near the top of the group page) — pauses the group; nobody can contribute while frozen.
   - **Freeze individual member** (button in the Members panel) — that member can't contribute, and if it's their turn to collect, payout confirmation for that round is blocked until they're unfrozen. The rest of the group keeps running normally.

3. **Auto-suggest payout order** — a new "Auto-suggest" button on the order-setting screen. In "preference" mode it prioritises members who submitted a requested slot; otherwise it suggests join order. It only pre-fills the draft — the organiser still reviews and can reorder before finalising, so this doesn't change the core design principle that the organiser has final say.

4. **Member preference submission — now actually functional.** Members in a "preference"-mode group can submit a requested payout slot before the order is finalised; the organiser sees these requests directly next to each member's name when setting the order.

---

## 0c. Deposit forfeiture — now actually implemented (Option A)

Previously, the deposit field existed but nothing ever touched it. Now:

- **Deposit is only ever forfeited once**, and only when a member defaults on a round that comes *after* the round where they already collected their own payout — this is the "collect and run" protection from Chapter 2/8 (citing Batool et al.'s B-ROSCA collateral model).
- **An ordinary late payment before a member's own turn does NOT touch their deposit.** That's still just the normal grace period → overdue flag → default count flow.
- Forfeiture happens automatically inside "Check overdue" — no separate action needed. It logs a `deposit_forfeit` transaction to the ledger and marks the member's deposit as forfeited (shown clearly in the Members panel, distinct from "no deposit").
- **This only fires once per member** — a `depositForfeited` flag prevents it from being deducted more than once, since it's a single-use safety net, not a repeatable balance.

---

## 0d. One-click "auto order & start now"

Added a second button next to "Auto-suggest" on the order-setting screen. Where Auto-suggest just pre-fills the draft for review, this one suggests the order **and** finalises it immediately — for organisers whose group already agreed on an order elsewhere (WhatsApp, Facebook, etc.) and just want the app to reflect that without manually re-dragging every row.

It's still an explicit organiser action (they have to press the button), so it doesn't contradict the "organiser-controlled order" design principle from Chapter 1/6 — it's a shortcut to executing a decision the organiser already made, not the app deciding on its own.

---

## 0e. Three new features: deposit refunds, trust score, automated overdue checks

**1. Deposit refund automation (bug fix — this was a broken promise before).**
The Create Group screen always said deposits are "refunded automatically once a member completes their remaining rounds," but nothing enforced that. Now, every time a contribution succeeds (mock or real Paystack), the system checks whether that member has now paid *every* round in the group — if so, their deposit is automatically refunded, logged as a `deposit_refund` transaction, and shown as "Deposit refunded" in the Members panel.

**2. Trust score.**
Every user now has a computed trust score (starts at 100, −15 per past default, floored at 0), shown next to each member in the organiser's Members panel. It's computed live from the `defaultCount` you were already tracking — no new data collection needed. This is a lightweight version of the "automated creditworthiness scoring" concept from Sharma & Chandrakar's TruChit paper (cited in your Chapter 2).

**3. Automated overdue-checking (cron job).**
Previously, a member only got flagged overdue if the organiser remembered to click "Check overdue." Now a scheduled job (`server/cron/overdueChecker.js`) runs automatically once a day and does this for every open round across every group. The manual button still works too — the cron job just means it no longer depends on the organiser remembering.

⚠️ **New dependency:** `node-cron` was added to `server/package.json`. Since you already have a `node_modules` folder from before, run `npm install` again inside `server/` to pick it up, or the server will fail to start with a "Cannot find module 'node-cron'" error.

**For testing:** the cron job runs once daily at midnight by default, which isn't useful for a quick demo. To test it faster, temporarily change the schedule in `server/cron/overdueChecker.js` from `"0 0 * * *"` to `"* * * * *"` (every minute), restart the server, and watch your terminal for `[cron]` log lines. Remember to change it back afterward.

---

## 0f. Downloadable ledger PDF + mock SMS/WhatsApp notifications

**1. Downloadable ledger PDF** — any active member (organiser included) can now click "Download PDF" on the group's Ledger card to get a formatted statement of every transaction: date, member, type, amount, status, and round.

⚠️ **Important framing note:** this is called a "Ledger Statement," not a "legally admissible" document — that's a much stronger legal claim than a PDF export can support on its own (Nigeria's Evidence Act 2011, Section 84 sets specific conditions for electronic evidence — certification, authentication, chain of custody — well beyond generating a file). What this PDF *does* give you: a SHA-256 integrity hash of the transaction data printed at the bottom, so any tampering after generation would be detectable. Use "downloadable ledger statement with integrity verification" in your report rather than "legally admissible," and you're on solid, honest ground.

**2. Mock SMS/WhatsApp notification system** — this actually fulfils Objective 3 from your original proposal ("real-time notifications"), which was promised but never built until now. Every relevant event creates a notification: due-soon reminders (24hrs before a round's due date), overdue flags, group approval, deposit refunded/forfeited, and payout confirmed. View them under the new **Notifications** link in the nav bar (with an unread-count badge).

No real SMS/WhatsApp messages are sent — this is explicitly a mock, same pattern as `MOCK_PAYMENTS` for Paystack. Each entry shows which channel it *would* have gone out on ("whatsapp" if the user has a phone number on file, "in_app" otherwise) and the exact message text. This is fully demoable without any SMS API cost or signup, and easy to swap for a real provider (e.g. Termii, which has a Nigeria-focused free sandbox tier) later — the `notify()` function in `server/utils/notify.js` is the one place you'd wire that in.

⚠️ **New dependency:** `pdfkit` was added to `server/package.json` for PDF generation. Run `npm install` again inside `server/` to pick up both this and `node-cron` from the previous update.

---

## 0g. Response to your first real test-run feedback (11 items)

**1. SMS sharing clarified (no bug):** the "Text (SMS)" button opens your phone's native Messages app pre-filled with the invite text — you still pick a contact and hit send yourself. It only works on an actual phone; desktop browsers have no SMS handler, so nothing happens there. Test this one on Android.

**2. Email vs. phone at registration — now a real choice.** You can register with EITHER an email or a phone number (a toggle on the Register page), not both required. Backend validates at least one is present. Login now accepts either in a single "Email or phone number" field.
   ⚠️ Trade-off: if you register with phone-only, password reset (see #3) currently requires an email — phone-only accounts get told to contact support if they forget their password, since SMS-based reset (OTP) is out of scope for now (same reasoning as why we mock SMS elsewhere — a real SMS OTP API costs money and needs signup).
   Paystack also requires *some* email to initialize a transaction — phone-only users get an invisible placeholder email generated automatically (`phone.234xxx@no-email.adashe.local`) purely to satisfy Paystack's API; it's never shown to them or used for anything else.

**3. Forgot/reset password — built from scratch, was completely missing before.** "Forgot password?" link on the Login page → enter your email → get a reset link → set a new password (with the same strength meter as registration). Like Paystack, this defaults to **mock mode** (`MOCK_EMAIL=true`): since no real SMTP is configured, the reset link is shown directly on screen instead of emailed — fully testable with zero setup. To send real emails later, set `MOCK_EMAIL=false` and fill in `SMTP_*` in `.env` (a Gmail account with an "App Password" works free).

**4. Back navigation added.** Create Group, Group Detail, and Notifications pages all now have a "← Back to dashboard" link at the top, instead of relying on the browser's own back button.

**5. Responsiveness clarified:** every page uses a single centered mobile-width column, so it won't overflow or break on a phone screen — but it also doesn't expand into a wider desktop-specific layout (same narrow column at all sizes). This was intentional given your users are phone-first, but let me know if you want a proper wide-screen layout added later. Minor fixes were made so the nav bar and multi-button rows wrap cleanly on very small (<420px) screens instead of overflowing.

**6. "Already requested to join this group" — this was correct behaviour, not a bug.** When you create a group, you (the organiser) are automatically added as an active member of it. If you then try to use your own join code with the *same account*, you're already a member — the error is expected. The message now says so explicitly ("You created this group, so you're already its organiser..."). To test the join flow, use a **second, different account**, exactly as the testing guide in Section 4 describes.

**7. Show/hide password — added.** A "Show"/"Hide" toggle now sits inside every password field (Login, Register, Reset Password).

**8. How Paystack payment works, explained plainly:** in mock mode (your current default), clicking "Contribute" marks it paid instantly — no payment screen appears at all, by design, for fast testing. In live mode (real test keys, `MOCK_PAYMENTS=false`), clicking "Contribute" redirects you to Paystack's actual hosted checkout page, and your ledger only updates once Paystack confirms payment via webhook. A small "(test mode — no real payment screen)" label now appears next to the Contribute button whenever mock mode is active, so this is clear without needing to ask.

**9. Trouble logging back in:** most likely explained by #7 — strong passwords with symbols are easy to mistype blindly. Try again now that you can toggle password visibility. If it still fails, the exact error message shown will tell us whether it's a typo or a real bug — "Invalid credentials" means wrong password/identifier; anything else is worth reporting back.

**10. Payout order now has three real options:** organiser-manual (drag reorder), **Auto-suggest** (fills by join order or submitted preference, organiser reviews before finalising), and now **Shuffle randomly** (genuine random order, same review-before-finalising flow) — plus the existing one-click "Use auto order & start now" for the suggested (non-random) order.

**11. Browser save-password/autofill — not something the app builds, but the forms weren't cooperating with it.** All login/register/reset password fields now have proper `autoComplete` attributes (`username`, `current-password`, `new-password`, `email`, `tel`), which is what browsers actually rely on to reliably prompt "Save password?" and to autofill correctly. Try logging in again and your browser should now offer to save it.

⚠️ **New dependency:** `nodemailer` was added to `server/package.json` for the password reset feature. Run `npm install` again inside `server/`.

---

## 0h. Response to your second real test-run feedback (7 items)

**1. Deposit amount — now a real formula, not a flat number.** Per your chosen design, deposit scales by payout position: the member collecting **first** (highest remaining risk to the group) pays the full base deposit you set at group creation; the member collecting **last** (zero remaining risk) pays **₦0**. It's linear in between. This is computed automatically the moment the organiser finalises the payout order — deposit amounts aren't known before that, so the deposit prompt now only appears after finalisation, showing each member their own specific amount.

**2. Weekly/monthly clarified (no bug):** each round requires **one full lump-sum contribution** by its due date, not incremental daily/weekly payments. "Weekly" just means rounds are 7 days apart. If you pictured a "save a little each day" model, that's a different feature we haven't built — say so if you want it.

**3. Minimum-members gate before the cycle starts — built.** Group creation now has an optional "Target number of members" field. If set, clicking "Finalise order" is blocked with a clear count ("6 of 10 joined so far") unless the organiser explicitly clicks "Start anyway" to override. No target set = no gate, as before.

**4. Member verification — two paths now, organiser's choice per person.** The open join code/link still works as before (organiser approves by recognising the name). New: an "Invite a specific person" form lets the organiser enter an exact email or phone number — if that person already has an account, they're added straight to active (skipping approval, since the organiser already explicitly vetted them by contact); if not, a placeholder waits and auto-activates the moment someone registers with that exact email/phone. Neither path is foolproof identity verification, but named invites are a meaningfully stronger check than an open code alone.

**5. Deposit refund timing — moved to whole-group, as you specified.** Refunds no longer fire the moment an individual member finishes paying — they now fire only when the **organiser confirms the very last round's payout** for the whole group, at which point the group is marked "completed" and every eligible member's deposit is refunded together. This is a real behaviour change from the previous version (which triggered per-member).

**6. Rotation wheel amount — fixed.** The pot amount was previously crammed into a small 88px circle at 12px font. It's now a large, clear headline ("This round's pot: ₦XX,XXX") above the wheel; the small circle just says "Pot" as a visual anchor.

**7. Member cap + late-join blocking — both built.** The "Target number of members" field from #3 also caps new joins once reached. Separately, and regardless of whether a target is set: **join requests are now blocked entirely once the cycle has started** (`orderFinalised = true`), with a clear message explaining the group's current cycle needs to complete first. Previously this wasn't checked at all, and a late joiner could end up in a broken state with no assigned round.

⚠️ **Data model change:** existing groups created before this update won't have `member.depositAmount` set per-member — if you have test data with deposits enabled from before, it's simplest to delete those test groups and recreate them so the new formula applies cleanly.

---

## 0i. Response to your third real test-run feedback (17 items)

**Already working (confirmed, no change needed):** rotation wheel highlighting the current recipient, due-soon reminders, payout-confirmed notifications, members seeing round deadlines, and the deposit-covers-outstanding-obligation logic all matched what you asked about — see your feedback for the item-by-item confirmation.

**1. Deadline configuration — built.** Create Group now has "day of the week" (weekly) or "day of the month / last day of the month" (monthly) selectors. Due dates snap to that exact day every round, instead of just drifting from whenever the group was created.

**2. Renamed to "security/commitment deposit" + gated participation.** UI text now says "security deposit" throughout. More importantly: a member **cannot make their first contribution until their deposit is paid**, enforced on the backend (not just the UI) — this was previously unenforced.

**4/13. Default-threshold warning — built, as you specified (warn, don't auto-freeze).** Each group has a configurable "default warning threshold" (default: 3). Once a member's total defaults cross it, the **organiser** gets a one-time warning notification. Nothing is frozen automatically — you still decide.

**5. Auto-refresh — built via polling.** The group page now refreshes itself every 15 seconds (same pattern as the notification bell), so if another member pays while you're looking at the page, you'll see it without hitting refresh. True real-time (websockets) is more than this project needs.

**8/9. Recurring rotations — simple version built, per your choice.** Once a group's cycle fully completes, the organiser sees a "Start new rotation" button. It reuses the exact same active members and payout order — no rule-editing yet (amount/frequency/members changes are a future enhancement, deliberately out of scope for now).

**12. Frozen status — now a persistent banner**, not just a message buried in the Rounds section. If you're frozen, you'll see it the moment the page loads.

**14 (phone/email visibility). Built.** The organiser's pending-approval list now shows each requester's email or phone alongside their name, directly supporting the identity-verification concern from your last round of feedback.

**15. Payout-order-method removed from group creation, as you suggested.** There's no upfront "how should order be set" choice anymore — member preference submission is simply always available before the order is finalised, and auto-suggest naturally uses whatever preferences exist (or falls back to join order). Up/down arrows are kept instead of true drag-and-drop — more reliable on mobile, same result.

**16. OTP verification — built.** Registration no longer logs you in immediately: a 6-digit code is generated and must be verified first. In mock mode (default), the code is shown directly on the verification screen and logged to the server console — no real SMTP/SMS setup required to test. Real delivery works via the same `MOCK_EMAIL=false` + SMTP settings already used for password reset.

**3. Not changed (already correct).** Deposit-covers-outstanding-obligation was already how the system worked — confirmed, no code change needed here.

**17. Partial contributions — not built, per your call.** Flagged as real complexity (affects the ledger model, overdue-flagging, and refund logic all at once) — good candidate for "future work" in Chapter 5 rather than something to rush in now.

⚠️ **New dependency:** none — `nodemailer` was already added for password reset and is reused for OTP delivery.
⚠️ **Data model change:** existing users created before this update have `isVerified: false` by default (the field didn't exist before) — **old test accounts will be locked out until they complete OTP verification** the next time they try to log in. This is expected; just verify them through the new flow, or delete and recreate test accounts.

---

## 0j. Deposit method toggle + dark mode

**Deposit calculation — now the organiser's choice.** Create Group has a new "How should the deposit amount be calculated?" option when deposits are enabled:
- **Scale by payout position** (the original formula) — first collector pays the full amount, last collector pays ₦0.
- **Same amount for everyone** — every active member pays the identical deposit, regardless of when they collect. Simpler, and closer to how many real groups just agree on one flat number.

Both options use the same underlying refund/forfeiture logic (Option A, whole-group timing) — only how the initial amount is calculated differs. This also applies consistently when starting a new rotation.

**Dark mode — built.** A sun/moon toggle now sits in the nav bar on every page. It respects your system's light/dark preference the first time you visit, then remembers your explicit choice in the browser after that. All existing colors (forest green, gold) were kept close to identical across both themes since they already read well on dark backgrounds — only neutrals (page background, card background, borders, muted text) actually change.

⚠️ **If you're updating an existing local copy:** a few places previously had hardcoded white/cream backgrounds (input fields, ghost buttons, the gold-tinted info boxes) that would have looked broken in dark mode — these were fixed to use theme-aware CSS variables as part of this change. No backend/database changes in this update.

---

## 1. Prerequisites

- **Node.js** v18+ installed (`node -v` to check)
- A **MongoDB Atlas** free-tier database (or local MongoDB if you have it installed)
- **Postman** or **curl** for testing the API directly
- (Optional, for real payments later) A free **Paystack** test account

### Getting a free MongoDB Atlas connection string
1. Go to mongodb.com/cloud/atlas and create a free account.
2. Create a free "M0" cluster.
3. Under **Database Access**, create a user with a username/password.
4. Under **Network Access**, add `0.0.0.0/0` (allow access from anywhere) — fine for a student project.
5. Click **Connect → Drivers**, copy the connection string, and paste it into `server/.env` as `MONGO_URI` (replace `<username>` and `<password>`).

---

## 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `MONGO_URI` — from step 1 above
- `JWT_SECRET` — any long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` )
- Leave `MOCK_PAYMENTS=true` for now — this lets you test contributions and deposits **without** setting up Paystack yet. It marks payments as successful immediately instead of calling the real API.

Run the server:
```bash
npm run dev
```
You should see:
```
MongoDB connected
Server running on http://localhost:5000
```

If you see a MongoDB connection error, double-check your `MONGO_URI`, and that your IP is allowed under Atlas → Network Access.

---

## 3. Frontend setup

In a **second terminal**:
```bash
cd client
npm install
npm run dev
```
Open the URL it prints (usually `http://localhost:5173`). The frontend talks to the backend automatically via Vite's proxy — you don't need to change anything.

---

## 4. Testing the full flow (recommended order)

You can test entirely through the **React app** at `localhost:5173`, or hit the **API directly** with Postman/curl (useful for your Chapter 4/5 testing write-up, since you can screenshot request/response pairs).

### A) Testing through the UI
1. **Register two accounts** — one to be the organiser (e.g. "Amina"), one to be a member (e.g. "Chidi"). Use two different browsers, or one normal + one incognito window, since you'll be logged in as both at once. Try registering one with email and the other with just a phone number, to test both paths.
2. As **Amina**, click **Create a group** — fill in the contribution amount, frequency, and toggle the deposit if you want to test it.
3. Copy the **join code** shown on the group page.
4. As **Chidi**, go to Dashboard → paste the join code → **Request to join**.
5. Back as **Amina**, refresh the group page → you'll see Chidi under **Pending approval** → click **Approve**.
6. As **Amina**, either use the ↑/↓ buttons to manually set the payout order, or try **Auto-suggest** / **Shuffle randomly** to pre-fill it, then **Finalise order & generate schedule** — this creates the rounds. ("Use auto order & start now" does the suggest-and-finalise in one click, if you want to skip the review step.)
7. As **Chidi**, refresh the group page → click **Contribute** on Round 1. Since `MOCK_PAYMENTS=true`, it's marked paid instantly.
8. As **Amina**, click **Confirm payout** once you're ready to close a round, or **Check overdue** to test the default-flagging logic (this only flags someone after the grace period — see note below).

### B) Testing the API directly (Postman/curl)
Base URL: `http://localhost:5000/api`

**Register:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Amina","email":"amina@test.com","password":"Passw0rd!23"}'
```
Copy the `token` from the response — you'll need it as a Bearer token for every request below. Note the password meets the strength policy (8+ chars, upper, lower, number, symbol) — a simpler password like "password123" will now be rejected with a 400 error.

**Login** (accepts either email or phone in the same `identifier` field):
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"amina@test.com","password":"Passw0rd!23"}'
```

**Create a group:**
```bash
curl -X POST http://localhost:5000/api/groups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"name":"Hostel B Adashe","contributionAmount":5000,"frequency":"monthly"}'
```

**Join a group (as a second registered user):**
```bash
curl -X POST http://localhost:5000/api/groups/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OTHER_USER_TOKEN" \
  -d '{"joinCode":"ADASHE-XXXXXX"}'
```

**Approve a member (organiser token):**
```bash
curl -X PATCH http://localhost:5000/api/groups/GROUP_ID/members/MEMBER_USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ORGANISER_TOKEN" \
  -d '{"action":"approve"}'
```

**Finalise payout order (organiser token):**
```bash
curl -X PUT http://localhost:5000/api/groups/GROUP_ID/order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ORGANISER_TOKEN" \
  -d '{"order":["USER_ID_1","USER_ID_2"]}'
```

**Contribute to a round (member token):**
```bash
curl -X POST http://localhost:5000/api/groups/GROUP_ID/rounds/ROUND_ID/contribute \
  -H "Authorization: Bearer MEMBER_TOKEN"
```

**View the ledger:**
```bash
curl http://localhost:5000/api/groups/GROUP_ID/ledger \
  -H "Authorization: Bearer ANY_MEMBER_TOKEN"
```

A ready-to-import **Postman collection** would normally go here — if you'd like, ask me to generate one as a `.json` file you can import directly instead of typing these out.

---

## 5. Testing the default/overdue logic

`check-overdue` only flags a member once **today's date is past the round's due date + grace period** (default: 2 days). To test this quickly without waiting:

- Temporarily edit `server/utils/schedule.js` and lower `gracePeriodDays` when creating test rounds, **or**
- In MongoDB Atlas (or Compass), manually edit a test Round's `dueDate` to a date in the past, then call the `check-overdue` endpoint for that round.

Remember to revert any manual edits before your actual defense demo.

---

## 6. Connecting real Paystack (optional, once MOCK_PAYMENTS is working)

1. Sign up free at dashboard.paystack.com — test mode requires no business registration.
2. Go to **Settings → API Keys & Webhooks**, copy the key starting `sk_test_...`.
3. Paste it into `server/.env` as `PAYSTACK_SECRET_KEY`, and set `MOCK_PAYMENTS=false`.
4. For webhooks to reach your local machine, use a tunnel tool like **ngrok** (`ngrok http 5000`), then paste the ngrok URL + `/api/webhooks/paystack` into Paystack's dashboard under **Webhooks**.
5. Use Paystack's documented test card numbers (in their docs) to simulate a real checkout.

---

## 7. What's deliberately NOT built (matches your Scope & Limitations, Section 1.4)

- No live/production payment processing — test mode only.
- No automated payout disbursement — organiser confirms payouts manually (`confirm-payout` endpoint).
- No scheduled job auto-running `check-overdue` — call it manually for now, or wire up `node-cron` in `server.js` as a next step.
- No email/SMS delivery for notifications yet — the data (overdue status, default counts) is tracked and queryable, but nothing sends yet. Good next feature to add.

---

## 8. Known gaps to fix before relying on this for your defense

- **Not yet run end-to-end** — this was written and syntax-checked only; you must `npm install` and test it yourself following Section 4 above, and fix anything that comes up.
- No automated test suite (unit/integration tests) yet — worth adding for Chapter 4/5's testing section.
- Frontend is functional but intentionally plain — doesn't yet match the polished UI/UX prototype from earlier. Ask me to wire the two together once the backend is confirmed working.

---

## 0f. Round pot and payout logic (latest change)

- **The pot now shows what has actually been collected** for the current round ("Collected this round ₦X of ₦Y expected"), not the theoretical total.
- **Contributions open one round at a time.** Only the earliest open round accepts payments, so nobody can pay into a future round while the current one is still being collected.
- **Payout equals the collected amount.** The organiser cannot pay out a round that is not fully funded without an explicit confirmation ("pay out only the collected amount?"). A round that has already been paid out cannot be confirmed again, and rounds must be paid out in order.
- **After a payout, the next round opens and the pot starts again at ₦0.** After the final payout the group completes and the pot shows ₦0.

---

## 0g. Security hardening (latest change)

- **helmet** adds secure HTTP headers; **CORS** only allows the app's own address (FRONTEND_URL) and localhost.
- **Rate limits** (express-rate-limit): login 10 per 15 min, OTP verify 8 per 15 min, OTP/reset requests 5 per 15 min, sign-ups 20 per hour, per IP address.
- **Login tokens** now last 7 days (JWT_EXPIRES_IN), down from 30.
- **Paystack callback_url** returns members to their group page after paying.
- The server refuses to start without JWT_SECRET and warns loudly if MOCK_PAYMENTS=true in production.
- Run `npm install` in /server once, because two packages were added.
