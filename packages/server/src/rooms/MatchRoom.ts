import { Room, Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";
import { MATCH, type InputMessage, type JoinOptions, type MatchEndMessage } from "@pixel-pitch/shared";
import { MatchState, PlayerState } from "./schema.js";
import { step, resetPositions } from "./physics.js";
import { updateBots } from "./botAI.js";
import { recordMatch, addGoals } from "../data/leaderboard.js";
import { isEligible, gateConfig } from "../tokenGate.js";

export class MatchRoom extends Room<MatchState> {
  maxClients: number = MATCH.PLAYERS_TO_START;
  private accumulator = 0;
  private secondTimer = 0;
  private matchId = randomUUID();
  private mode: "pvp" | "bots" = "pvp";
  private botSeq = 0;

  onCreate(options?: { mode?: "pvp" | "bots" }) {
    this.mode = options?.mode === "bots" ? "bots" : "pvp";
    // A bots room is single-player vs AI, so it only accepts one human client.
    if (this.mode === "bots") this.maxClients = 1;
    this.setState(new MatchState());
    this.state.timeLeft = MATCH.DURATION_SEC;

    this.onMessage("input", (client, msg: InputMessage) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase !== "playing") return;
      if (msg.seq <= p.lastSeq) return; // ignore stale/duplicate input
      p.lastSeq = msg.seq;
      p.inputDx = clampUnit(msg.dx);
      p.inputDy = clampUnit(msg.dy);
      p.inputKick = !!msg.kick;
    });

    this.onMessage("chat", (client, msg: { text?: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const text = String(msg?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!text) return;
      const now = Date.now();
      if (now - p.lastChatAt < 400) return; // light rate limit
      p.lastChatAt = now;
      this.broadcast("chat", { name: p.name, team: p.team, text });
    });

    // Fixed-timestep simulation.
    const tickMs = 1000 / MATCH.TICK_RATE;
    this.setSimulationInterval((deltaMs) => this.update(deltaMs), tickMs);
  }

  // Colyseus calls onAuth before onJoin; reject ineligible wallets here.
  async onAuth(_client: Client, options: JoinOptions) {
    if (!options?.wallet) throw new Error("wallet required");
    if (!gateConfig.enabled) return true; // gating disabled in dev
    const res = await isEligible(options.wallet);
    if (!res.ok) {
      throw new Error(
        `Hold at least ${res.required} tokens to play. Your balance: ${res.balance}`
      );
    }
    return true;
  }

  onJoin(client: Client, options: JoinOptions) {
    const blueCount = this.countTeam("blue");
    const orangeCount = this.countTeam("orange");
    const team = blueCount <= orangeCount ? "blue" : "orange";

    const p = new PlayerState();
    p.sessionId = client.sessionId;
    p.wallet = options.wallet;
    p.name = (options.displayName || options.wallet.slice(0, 4)).slice(0, 16);
    p.team = team;
    this.state.players.set(client.sessionId, p);
    resetPositions(this.state);

    if (this.mode === "bots") {
      // Fill the rest of the match with AI and start immediately.
      this.fillWithBots();
      this.lock();
      this.startCountdown();
      return;
    }

    // PvP: lock and kick off once the lobby is full.
    if (this.state.players.size >= MATCH.PLAYERS_TO_START) {
      this.lock();
      this.startCountdown();
    }
  }

  private fillWithBots() {
    const addBot = (team: "blue" | "orange") => {
      const id = `bot_${++this.botSeq}`;
      const p = new PlayerState();
      p.sessionId = id;
      p.wallet = `BOT:${id}`;
      p.name = `CPU ${this.botSeq}`;
      p.team = team;
      p.isBot = true;
      p.connected = true;
      this.state.players.set(id, p);
    };
    while (this.countTeam("blue") < MATCH.TEAM_SIZE) addBot("blue");
    while (this.countTeam("orange") < MATCH.TEAM_SIZE) addBot("orange");
    resetPositions(this.state);
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    // Keep slot during play; remove entirely if still in lobby.
    if (this.state.phase === "lobby") this.state.players.delete(client.sessionId);
  }

  private startCountdown() {
    this.state.phase = "countdown";
    this.state.countdown = MATCH.COUNTDOWN_SEC;
    resetPositions(this.state);
  }

  private update(deltaMs: number) {
    const dt = deltaMs / 1000;

    if (this.state.phase === "countdown") {
      this.secondTimer += dt;
      if (this.secondTimer >= 1) {
        this.secondTimer -= 1;
        this.state.countdown -= 1;
        if (this.state.countdown <= 0) {
          this.state.phase = "playing";
          this.state.timeLeft = MATCH.DURATION_SEC;
        }
      }
      return;
    }

    if (this.state.phase !== "playing") return;

    if (this.mode === "bots") updateBots(this.state);

    // Step physics with a fixed sub-step for stability.
    this.accumulator += dt;
    const fixed = 1 / MATCH.TICK_RATE;
    while (this.accumulator >= fixed) {
      const goal = step(this.state, fixed);
      if (goal) this.onGoal(goal);
      this.accumulator -= fixed;
    }

    // Match clock.
    this.secondTimer += dt;
    if (this.secondTimer >= 1) {
      this.secondTimer -= 1;
      this.state.timeLeft -= 1;
      if (this.state.timeLeft <= 0) this.endMatch();
    }
  }

  private onGoal(scoringTeam: "blue" | "orange") {
    if (scoringTeam === "blue") this.state.scoreBlue++;
    else this.state.scoreOrange++;

    // Attribute the goal to the last player who touched the ball (own-goals excluded).
    const scorer = this.state.players.get(this.state.lastTouchSessionId);
    if (scorer && scorer.team === scoringTeam) scorer.goals++;

    resetPositions(this.state);
    this.state.lastTouchSessionId = "";
  }

  private endMatch() {
    this.state.phase = "ended";
    const blueWallets: string[] = [];
    const orangeWallets: string[] = [];
    this.state.players.forEach((p) => {
      (p.team === "blue" ? blueWallets : orangeWallets).push(p.wallet);
      // Bots-mode is practice: never persist to the leaderboard/airdrop pool.
      if (this.mode === "pvp" && !p.isBot) addGoals(p.wallet, p.goals);
    });

    const winner =
      this.state.scoreBlue > this.state.scoreOrange
        ? "blue"
        : this.state.scoreOrange > this.state.scoreBlue
          ? "orange"
          : "draw";

    if (this.mode === "pvp") {
      recordMatch({
        matchId: this.matchId,
        endedAt: Date.now(),
        winner,
        scoreBlue: this.state.scoreBlue,
        scoreOrange: this.state.scoreOrange,
        blueWallets: blueWallets.filter((w) => !w.startsWith("BOT:")),
        orangeWallets: orangeWallets.filter((w) => !w.startsWith("BOT:")),
      });
    }

    const payload: MatchEndMessage = {
      scoreBlue: this.state.scoreBlue,
      scoreOrange: this.state.scoreOrange,
      winner,
      blueWallets,
      orangeWallets,
    };
    this.broadcast("matchEnd", payload);

    // Give clients a moment to show the result, then close the room.
    this.clock.setTimeout(() => this.disconnect(), 8000);
  }

  private countTeam(team: "blue" | "orange") {
    let n = 0;
    this.state.players.forEach((p) => {
      if (p.team === team) n++;
    });
    return n;
  }
}

function clampUnit(v: number) {
  if (Number.isNaN(v)) return 0;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
