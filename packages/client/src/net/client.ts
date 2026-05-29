import { Client, Room } from "colyseus.js";
import type { JoinOptions } from "@pixel-pitch/shared";

const HTTP_URL = import.meta.env.VITE_SERVER_HTTP ?? "http://localhost:2567";
const WS_URL = import.meta.env.VITE_SERVER_WS ?? "ws://localhost:2567";

const client = new Client(WS_URL);

export type GameMode = "pvp" | "bots";

export async function joinMatch(options: JoinOptions, mode: GameMode = "pvp"): Promise<Room> {
  return client.joinOrCreate(mode === "bots" ? "bots" : "match", options);
}

export async function fetchEligibility(wallet: string) {
  const r = await fetch(`${HTTP_URL}/eligibility/${wallet}`);
  return (await r.json()) as { ok: boolean; balance: number; required: number };
}

export async function fetchConfig() {
  const r = await fetch(`${HTTP_URL}/config`);
  return (await r.json()) as { gateEnabled: boolean; mint: string; minHold: number };
}

export async function fetchLeaderboard() {
  const r = await fetch(`${HTTP_URL}/leaderboard`);
  return (await r.json()) as Array<{ wallet: string; wins: number; goals: number }>;
}
