# Deploying Pixel Pitch

Two pieces deploy to two places:

- **Game server** (`packages/server`, Colyseus + WebSocket) → **Railway** (always-on)
- **Frontend** (`packages/client`, the landing page + game) → **Vercel** (static)

Deploy the **server first** so you have its URL when configuring Vercel.

---

## 1. Push the code to GitHub

```bash
cd pixel-pitch
git init
git add .
git commit -m "Initial commit: Pixel Pitch"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/pixel-pitch.git
git branch -M main
git push -u origin main
```

---

## 2. Deploy the server to Railway

1. On https://railway.com → **New Project → Deploy from GitHub repo** → pick `pixel-pitch`.
2. Railway reads `railway.json`: it runs `npm run build` then `npm start` (boots the server).
3. Open the service → **Variables** and add:
   | Variable | Value |
   |---|---|
   | `TOKEN_MINT` | your pump.fun SPL mint (leave blank to disable the token gate) |
   | `SOLANA_RPC_URL` | a paid RPC URL (Helius/QuickNode) — avoids public rate limits |
   | `TOKEN_MIN_HOLD` | minimum token balance to play, e.g. `1` |
   > `PORT` is provided by Railway automatically — do **not** set it.
4. Open **Settings → Networking → Generate Domain**. You'll get something like
   `pixel-pitch-production.up.railway.app`. Copy it.

Test it: visiting `https://<your-domain>/health` should show `{"ok":true}`.

---

## 3. Deploy the frontend to Vercel

1. On https://vercel.com → **Add New → Project** → import the same GitHub repo.
2. Vercel reads `vercel.json` (build command + output dir are preset). Leave Root Directory as the repo root.
3. Add **Environment Variables** (these are read at build time):
   | Variable | Value |
   |---|---|
   | `VITE_SERVER_HTTP` | `https://<your-railway-domain>` |
   | `VITE_SERVER_WS` | `wss://<your-railway-domain>` |
   > Note `wss://` (secure WebSocket) and `https://` — same domain, different scheme.
4. **Deploy.** Open the Vercel URL → **Play Now** → Connect/Skip → Find Match should work.

If you change the env vars later, hit **Redeploy** on Vercel (Vite inlines them at build time).

---

## Airdrop worker (auto-payouts on Railway)

Run the payout loop as a **separate Railway service** so it pays automatically 24/7
(top 5 split `AIRDROP_PCT`% of the treasury every `WINDOW_MINUTES`).

1. Railway → same project → **New → GitHub Repo** → pick `pixel-pitch` again
   (this creates a second service).
2. In that service → **Settings**:
   - **Build Command**: `npm install && npm run airdrop:build`
   - **Start Command**: `npm run airdrop:loop`
   - Root Directory: leave as repo root.
3. In that service → **Variables**, add:
   | Variable | Value |
   |---|---|
   | `TOKEN_MINT` | `EmBaE6Td1rg1oa4F7PNyozPnYeTQ6FLXhAwKpLV2pump` |
   | `TREASURY_ADDRESS` | `EuET2mzucF7FjKSGhFWxKGvE4txhwV69pz4NN5SHxeKp` |
   | `PAYER_SECRET` | the treasury's base58 private key (Solflare export) |
   | `SOLANA_RPC_URL` | a paid mainnet RPC (Helius/QuickNode) |
   | `SERVER_HTTP` | `https://pixel-pitchserver-production.up.railway.app` |
   | `WINDOW_MINUTES` | `20` |
   | `AIRDROP_PCT` | `0.4` |
   | `TOP_N` | `5` |
   | `RANK_WEIGHTS` | `40,25,11.67,11.67,11.66` |
4. Deploy. The worker logs each cycle's payout. It's a **worker** (no public domain
   needed). Keep the treasury funded with only what you're comfortable auto-sending.

## Things to upgrade before real launch

- **Leaderboard persistence**: it currently writes a JSON file that resets on every
  redeploy/restart. Add a Railway Postgres or Redis and move the store there.
- **CORS**: the server allows all origins. Lock it to your Vercel domain.
- **Wallet ownership proof**: the gate trusts the wallet address; add the signed-nonce
  challenge (`signOwnership` already exists client-side) so balances can't be spoofed.
- **Airdrop key**: keep the payer keypair off the repo; run the airdrop tool from a
  trusted machine, not the public server.
