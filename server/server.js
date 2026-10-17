require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const startOverdueCron = require("./cron/overdueChecker");

const authRoutes = require("./routes/authRoutes");
const groupRoutes = require("./routes/groupRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

// Fail fast on a missing signing secret instead of issuing broken tokens.
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Add it to your .env file (any long random string).");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && process.env.MOCK_PAYMENTS === "true") {
  console.warn("WARNING: MOCK_PAYMENTS=true in production. Webhook signatures are NOT checked and OTP codes are returned in API responses. Use this for demos only.");
}

const app = express();

// The app sits behind a proxy on hosts such as Render, so trust the first hop;
// otherwise every visitor would look like the same IP address to the rate limiters.
app.set("trust proxy", 1);

// Secure HTTP headers. The content-security policy is left off because the
// React build loads web fonts; tighten it if you add a stricter font setup.
app.use(helmet({ contentSecurityPolicy: false }));

// Only the app's own address (and local development) may call the API from a browser.
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));

// IMPORTANT: the Paystack webhook route needs the raw request body to verify
// the signature, so it's mounted with express.raw() BEFORE express.json()
// is applied to everything else. If you swap this order, signature
// verification will break.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ message: "Adashe/Asusu Digital Contribution System API is running" });
});

// Public, read-only — lets the frontend show a "test mode" badge near the
// Contribute button without hardcoding it, and without needing auth.
app.get("/api/config", (req, res) => {
  res.json({ mockPayments: process.env.MOCK_PAYMENTS === "true" });
});

app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/notifications", notificationRoutes);

// In production the same server also serves the built React app (client/dist),
// so the whole system runs as ONE service and the client's relative "/api"
// calls need no extra configuration. In development this block is skipped.
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

// Basic error handler for anything that slips past individual try/catch blocks.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  startOverdueCron();
});
