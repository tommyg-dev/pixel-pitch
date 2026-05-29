import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeaderboardEntry, MatchResultRecord, Team } from "@pixel-pitch/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "leaderboard.json");

interface Store {
  players: Record<string, LeaderboardEntry>;
  matches: MatchResultRecord[];
}

function load(): Store {
  if (!existsSync(FILE)) return { players: {}, matches: [] };
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Store;
  } catch {
    return { players: {}, matches: [] };
  }
}

function save(store: Store) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(store, null, 2));
}

function ensure(store: Store, wallet: string): LeaderboardEntry {
  if (!store.players[wallet]) {
    store.players[wallet] = {
      wallet,
      wins: 0,
      losses: 0,
      draws: 0,
      goals: 0,
      lastWinAt: 0,
    };
  }
  return store.players[wallet];
}

export function recordMatch(record: MatchResultRecord) {
  const store = load();
  store.matches.push(record);

  const apply = (wallets: string[], team: Team) => {
    for (const w of wallets) {
      const e = ensure(store, w);
      if (record.winner === "draw") e.draws++;
      else if (record.winner === team) {
        e.wins++;
        e.lastWinAt = record.endedAt;
      } else e.losses++;
    }
  };
  apply(record.blueWallets, "blue");
  apply(record.orangeWallets, "orange");
  save(store);
}

export function addGoals(wallet: string, goals: number) {
  if (goals <= 0) return;
  const store = load();
  ensure(store, wallet).goals += goals;
  save(store);
}

export function topPlayers(limit = 50): LeaderboardEntry[] {
  const store = load();
  return Object.values(store.players)
    .sort((a, b) => b.wins - a.wins || b.goals - a.goals)
    .slice(0, limit);
}

/** Wallets that won at least one match in the trailing window (for airdrops). */
export function winnersSince(sinceMs: number): { wallet: string; wins: number }[] {
  const store = load();
  const tally = new Map<string, number>();
  for (const m of store.matches) {
    if (m.endedAt < sinceMs || m.winner === "draw") continue;
    const winners = m.winner === "blue" ? m.blueWallets : m.orangeWallets;
    for (const w of winners) tally.set(w, (tally.get(w) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([wallet, wins]) => ({ wallet, wins }))
    .sort((a, b) => b.wins - a.wins);
}
