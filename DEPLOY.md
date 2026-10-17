# Deploying the Adashe app (one service on Render + MongoDB Atlas)

1. Push this folder to a GitHub repository (the .env file is ignored, never upload it).
2. MongoDB Atlas: Network Access -> Add IP Address -> Allow access from anywhere (0.0.0.0/0). Copy your connection string (MONGO_URI).
3. Render.com -> New -> Web Service -> connect the GitHub repo.
   - Build command: cd client && npm install && npm run build && cd ../server && npm install
   - Start command: cd server && npm start
4. Environment variables on Render: MONGO_URI, JWT_SECRET (a long random string), FRONTEND_URL (your Render URL, e.g. https://adashe.onrender.com), MOCK_PAYMENTS=true, MOCK_EMAIL=true, NODE_ENV=production (optional: JWT_EXPIRES_IN=7d).
   For Paystack test mode use MOCK_PAYMENTS=false and PAYSTACK_SECRET_KEY=sk_test_xxx, then set the Paystack webhook URL to https://YOUR-URL/api/webhooks/paystack.
5. Open the Render URL. Check https://YOUR-URL/api/health.

Note: on Render's free plan the service sleeps after inactivity (first load takes about 30 seconds) and the daily overdue cron only runs while it is awake. Open the site a few minutes before your defense.
Never leave MOCK_PAYMENTS=true on a public site used by real people: it skips webhook signature checks and returns OTP codes in API responses.

Paystack steps are in PAYSTACK_SETUP.md. After pulling these changes run `npm install` inside the server folder (new packages: helmet, express-rate-limit).
