import "./env.js"; // must be first: loads .env before env-reading modules
import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MatchRoom } from "./rooms/MatchRoom.js";
import { topPlayers, winnersSince } from "./data/leaderboard.js";
import { isEligible, gateConfig } from "./tokenGate.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/config", (_req, res) => {
  res.json({ gateEnabled: gateConfig.enabled, mint: gateConfig.mint, minHold: gateConfig.minHold });
});

// Pre-flight check the client uses to show a friendly gate message before connecting.
app.get("/eligibility/:wallet", async (req, res) => {
  const result = await isEligible(req.params.wallet);
  res.json(result);
});

app.get("/leaderboard", (_req, res) => {
  res.json(topPlayers(50));
});

// Trailing-window winners, used by the airdrop tool (default last hour).
app.get("/airdrop/winners", (req, res) => {
  const minutes = Number(req.query.minutes ?? 60);
  const since = Date.now() - minutes * 60_000;
  res.json(winnersSince(since));
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("match", MatchRoom);
gameServer.define("bots", MatchRoom, { mode: "bots" });

httpServer.listen(PORT, () => {
  console.log(`pixel-pitch server listening on :${PORT}`);
  console.log(`token gate: ${gateConfig.enabled ? `${gateConfig.mint} (min ${gateConfig.minHold})` : "DISABLED (dev)"}`);
});
