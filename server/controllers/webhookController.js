const { verifyWebhookSignature } = require("../utils/paystack");
const Transaction = require("../models/Transaction");
const Group = require("../models/Group");

// POST /api/webhooks/paystack
// IMPORTANT: this route must receive the RAW request body (see server.js),
// because the signature is computed over the exact raw bytes Paystack sent.
async function paystackWebhook(req, res) {
  const signature = req.headers["x-paystack-signature"];
  const rawBody = req.body; // Buffer, thanks to express.raw() on this route

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(rawBody.toString("utf8"));

  if (event.event === "charge.success") {
    const reference = event.data.reference;
    const txn = await Transaction.findOne({ paystackReference: reference });

    if (txn && txn.status !== "success") {
      txn.status = "success";
      txn.paidAt = new Date();
      await txn.save();

      if (txn.type === "deposit") {
        const group = await Group.findById(txn.group);
        const member = group.members.find((m) => m.user && m.user.equals(txn.member));
        if (member) {
          member.depositPaid = true;
          await group.save();
        }
      }

      // Note: contribution success no longer triggers a deposit-refund
      // check here. Per the agreed design, refunds are only triggered when
      // the ORGANISER confirms the group's very last payout (see
      // confirmPayout in contributionController.js), not by an individual
      // member finishing their own contributions early.
    }
  }

  // Always acknowledge receipt so Paystack doesn't keep retrying.
  return res.status(200).send("ok");
}

module.exports = { paystackWebhook };
