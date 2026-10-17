# Getting Paystack test mode working (free, no business documents needed)

1. Go to https://paystack.com and click "Get started". Sign up with your email and verify it.
2. Log in. At the top of the dashboard make sure the **Test Mode** switch is ON.
3. Go to **Settings -> API Keys & Webhooks**. Copy the **Test Secret Key** (starts with `sk_test_`). Never share it or put it on GitHub.
4. Put it in `server/.env`:
   ```
   PAYSTACK_SECRET_KEY=sk_test_your_key_here
   MOCK_PAYMENTS=false
   ```
   On Render, add the same two values under Environment.
5. Same page, **Test Webhook URL**: paste `https://YOUR-RENDER-URL/api/webhooks/paystack` and save.
   Running on your own computer? Install ngrok, run `ngrok http 5000`, and use `https://xxxx.ngrok-free.app/api/webhooks/paystack` instead.
6. Restart the server and click Contribute. You are sent to Paystack's checkout, then back to your group page.
   Use Paystack's test card from their documentation ("Test payments" page): card 4084 0840 8408 4081, any future expiry date, CVV 408, then PIN 0000 and OTP 123456 if asked. Confirm these on Paystack's docs in case they changed.
7. The contribution turns to success only when Paystack's webhook reaches your server and its signature verifies. If it stays pending, the webhook URL is wrong or unreachable.

Going live later needs a verified business (CAC documents, BVN, a bank account) and the Live Secret Key. You do NOT need that for your project defense.
If a key is ever exposed, roll (regenerate) it on the same Settings page.
