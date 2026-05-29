# Pixel Pitch

Retro pixel-art **3v3 soccer** with Solana token-gating, a leaderboard, and hourly
top-team airdrops. Inspired by kintara.gg.

- **Client** — Phaser 3 + TypeScript + Vite (browser), wallet connect for Phantom / Solflare
- **Server** — Colyseus authoritative game server (lobby matchmaking + physics + scoring)
- **Airdrop** — CLI that pays SPL tokens to recent winners (dry-run + manual approval)
- **Shared** — game constants and message contracts used by client and server

## Quick start

```bash
npm install
npm run dev          # builds shared, then runs server (:2567) + client (:5173)
```

Open http://localhost:5173, click **Connect Wallet**, then **Find Match**.
A match starts once **6 players** are in the lobby (3 blue vs 3 orange).
Controls: **WASD/Arrows** to move, **Space** to kick.

> With no `TOKEN_MINT` configured the token gate is **disabled** so you can develop
> locally. To test 3v3 solo, open 6 browser tabs/windows (each needs a connected wallet).

## Token gating

Copy `packages/server/.env.example` to `packages/server/.env` and set:

```
TOKEN_MINT=<your pump.fun SPL mint>
TOKEN_MIN_HOLD=1
SOLANA_RPC_URL=<a paid RPC for production>
```

The server verifies the wallet's on-chain balance in `onAuth` before letting a player
into matchmaking. Ineligible wallets are rejected with a friendly message.

## Leaderboard & airdrops

Match results are persisted to `packages/server/src/data/leaderboard.json`. Endpoints:

- `GET /leaderboard` — top players by wins/goals
- `GET /airdrop/winners?minutes=60` — wallets that won in the trailing window

Run the airdrop (defaults to **devnet**, **dry-run**):

```bash
cp packages/airdrop/.env.example packages/airdrop/.env   # set TOKEN_MINT + PAYER_KEYPAIR
npm run airdrop                 # dry-run: prints the payout plan
npm run airdrop -- --execute    # prompts for "YES" before broadcasting transfers
```

Schedule it hourly with cron once you trust the plan:
`0 * * * * cd /path/to/pixel-pitch && npm run airdrop -- --execute`

## Production hardening (not done yet)

- **Wallet ownership proof**: gate currently trusts the wallet string. Add a
  signed-nonce challenge (`signOwnership` helper exists client-side) verified server-side
  so players can't spoof someone else's balance.
- **Airdrop key safety**: the payer keypair is a hot wallet. Keep it funded minimally,
  store the secret outside the repo, and consider moving to an on-chain claim program.
- **Persistence**: swap the JSON store for Postgres/Redis before scaling.
- **Anti-cheat**: server is authoritative for physics, but add input-rate limits and
  sanity checks. Add reconnection handling for dropped players mid-match.
```
