import { Client, Room } from "colyseus.js";
import type { JoinOptions } from "@pixel-pitch/shared";

const HTTP_URL = import.meta.env.VITE_SERVER_HTTP ?? "http://localhost:2567";
const WS_URL = import.meta.env.VITE_SERVER_WS ?? "ws://localhost:2567";

const client = new Client(WS_URL);

export type GameMode = "pvp" | "bots";
export type GameFormat = "1v1" | "3v3";

export async function joinMatch(options: JoinOptions, mode: GameMode = "pvp", format: GameFormat = "3v3"): Promise<Room> {
  const prefix = mode === "bots" ? "bots" : "match";
  return client.joinOrCreate(`${prefix}${format}`, options);
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
