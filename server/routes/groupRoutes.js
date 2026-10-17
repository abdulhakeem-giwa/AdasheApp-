const express = require("express");
const { protect } = require("../middleware/auth");
const { loadGroup, requireOrganiser, requireActiveMember } = require("../middleware/groupAccess");
const {
  createGroup,
  myGroups,
  getGroup,
  joinGroup,
  inviteByContact,
  reviewMember,
  setPayoutOrder,
  freezeGroup,
  freezeMember,
  submitPreference,
  suggestOrder,
  startNewRotation,
} = require("../controllers/groupController");
const { getLedger, contribute, payDeposit, confirmPayout, checkOverdue, downloadLedgerPdf } = require("../controllers/contributionController");

const router = express.Router();

router.use(protect); // every group route requires login

router.post("/", createGroup);
router.get("/", myGroups);
router.post("/join", joinGroup);

router.post("/:id/invite", loadGroup, requireOrganiser, inviteByContact);

router.get("/:id", loadGroup, requireActiveMember, getGroup);
router.get("/:id/ledger", loadGroup, requireActiveMember, getLedger);
router.get("/:id/ledger/pdf", loadGroup, requireActiveMember, downloadLedgerPdf);

router.patch("/:id/members/:memberId", loadGroup, requireOrganiser, reviewMember);
router.put("/:id/order", loadGroup, requireOrganiser, setPayoutOrder);
router.get("/:id/suggest-order", loadGroup, requireOrganiser, suggestOrder);
router.post("/:id/start-new-rotation", loadGroup, requireOrganiser, startNewRotation);

router.patch("/:id/freeze", loadGroup, requireOrganiser, freezeGroup);
router.patch("/:id/members/:memberId/freeze", loadGroup, requireOrganiser, freezeMember);
router.patch("/:id/my-preference", loadGroup, requireActiveMember, submitPreference);

router.post("/:id/deposit", loadGroup, requireActiveMember, payDeposit);
router.post("/:id/rounds/:roundId/contribute", loadGroup, requireActiveMember, contribute);

router.patch("/:id/rounds/:roundId/confirm-payout", loadGroup, requireOrganiser, confirmPayout);
router.post("/:id/rounds/:roundId/check-overdue", loadGroup, requireOrganiser, checkOverdue);

module.exports = router;
