import { Schema, type, MapSchema } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") sessionId = "";
  @type("string") wallet = "";
  @type("string") name = "";
  @type("string") team: "blue" | "orange" = "blue";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
  @type("number") goals = 0;
  @type("boolean") connected = true;
  @type("boolean") isBot = false;

  // Server-side only (not synced): latest input.
  inputDx = 0;
  inputDy = 0;
  inputKick = false;
  lastSeq = 0;
  lastChatAt = 0;
}

export class BallState extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") vx = 0;
  @type("number") vy = 0;
}

export class MatchState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(BallState) ball = new BallState();
  @type("number") scoreBlue = 0;
  @type("number") scoreOrange = 0;
  @type("number") timeLeft = 0; // seconds
  @type("number") playersToStart = 6; // 2 for 1v1, 6 for 3v3
  // lobby | countdown | playing | ended
  @type("string") phase: "lobby" | "countdown" | "playing" | "ended" = "lobby";
  @type("number") countdown = 0;

  // Server-side only (not synced): session id of last player to touch the ball.
  lastTouchSessionId = "";
}
