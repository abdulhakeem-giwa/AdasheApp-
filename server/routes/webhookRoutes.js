const express = require("express");
const { paystackWebhook } = require("../controllers/webhookController");

const router = express.Router();

// Note: express.raw() body parsing for this route is applied in server.js,
// BEFORE express.json() is applied globally — order matters here.
router.post("/paystack", paystackWebhook);

module.exports = router;
