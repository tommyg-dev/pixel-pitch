// Shared game constants and message contracts used by both client and server.
// The server is authoritative; these values must match on both sides.

export const FIELD = {
  WIDTH: 1280,
  HEIGHT: 720,
  GOAL_WIDTH: 24, // depth of the goal mouth from each end line
  GOAL_HEIGHT: 200, // vertical span of the goal opening
  MARGIN: 74, // playable inset from the canvas edge (leaves room for stands + ad boards)
} as const;

export const PLAYER = {
  RADIUS: 18,
  ACCEL: 1000, // px/s^2
  MAX_SPEED: 185, // px/s
  FRICTION: 0.86, // per-tick velocity damping
} as const;

export const BALL = {
  RADIUS: 12,
  FRICTION: 0.985,
  MAX_SPEED: 620,
  KICK_FORCE: 380,
} as const;

export const MATCH = {
  TEAM_SIZE: 3,
  PLAYERS_TO_START: 6, // a full 3v3 lobby
  DURATION_SEC: 90,
  TICK_RATE: 30, // server simulation ticks per second
  COUNTDOWN_SEC: 3,
} as const;

export const AIRDROP = {
  // Standings accumulate for this many minutes, then reset; top players get paid.
  CYCLE_MINUTES: 20,
} as const;

export const TOKEN_GATE = {
  // SPL mint of the pump.fun token. Override via server env TOKEN_MINT.
  DEFAULT_MINT: "",
  // Minimum raw token balance (UI amount) required to enter matchmaking.
  DEFAULT_MIN_HOLD: 1,
} as const;

export type Team = "blue" | "orange";

export type Vec2 = { x: number; y: number };

// ----- Client -> Server messages -----
export interface InputMessage {
  // Normalized direction vector, magnitude 0..1.
  dx: number;
  dy: number;
  // True on the tick the player pressed kick.
  kick: boolean;
  seq: number; // client input sequence for reconciliation
}

// ----- Server -> Client one-off messages -----
export interface MatchEndMessage {
  scoreBlue: number;
  scoreOrange: number;
  winner: Team | "draw";
  blueWallets: string[];
  orangeWallets: string[];
}

export interface JoinOptions {
  wallet: string; // base58 public key
  displayName?: string;
}

// Chat: client sends { text }, server broadcasts the enriched message.
export interface ChatSend {
  text: string;
}
export interface ChatMessage {
  name: string;
  team: Team;
  text: string;
}

export interface LeaderboardEntry {
  wallet: string;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  lastWinAt: number; // epoch ms
}

export interface MatchResultRecord {
  matchId: string;
  endedAt: number;
  winner: Team | "draw";
  scoreBlue: number;
  scoreOrange: number;
  blueWallets: string[];
  orangeWallets: string[];
  goals: Record<string, number>; // per-wallet goals scored this match
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
