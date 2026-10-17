const cron = require("node-cron");
const { checkAllOpenRounds } = require("../utils/schedule");

/**
 * Automates what the organiser's manual "Check overdue" button does.
 * Runs once a day at midnight server time by default — adjust the cron
 * expression below if you want it more frequent (e.g. "0 * * * *" for
 * hourly) while testing.
 *
 * The manual button in the UI still works too — this doesn't replace it,
 * it just means the organiser no longer HAS to remember to click it.
 */
function startOverdueCron() {
  cron.schedule("0 0 * * *", async () => {
    console.log("[cron] Running scheduled overdue check across all open rounds...");
    try {
      const result = await checkAllOpenRounds();
      console.log(
        `[cron] Checked ${result.roundsChecked} open round(s); ${result.roundsWithNewFlags} had new overdue flags; ${result.remindersSent} due-soon reminder(s) sent.`
      );
    } catch (err) {
      console.error("[cron] Overdue check failed:", err.message);
    }
  });
  console.log("Overdue-check cron job scheduled (daily at midnight).");
}

module.exports = startOverdueCron;
