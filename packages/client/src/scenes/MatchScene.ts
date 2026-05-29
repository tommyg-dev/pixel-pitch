import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { FIELD, MATCH, type InputMessage } from "@pixel-pitch/shared";
import { CHAR_SCALE, ensureBallTexture, ensurePlayerTextures, variantFor } from "./sprites";
import { drawStadium, drawPitch, drawAdBoards, type PitchTheme } from "./field";
import { playGoal, playWhistle, playMatchEnd, playKick } from "../sound";

interface PlayerView extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Image;
  prevX: number;
  prevY: number;
  animClock: number;
  facing: number;
  texPrefix: string;
}

export class MatchScene extends Phaser.Scene {
  private room!: Room;
  private mySessionId = "";
  private seq = 0;

  private playerSprites = new Map<string, PlayerView>();
  private ball!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private prevScoreBlue = 0;
  private prevScoreOrange = 0;
  private prevPhase = "lobby";
  private myTeam: "blue" | "orange" | null = null;
  private theme: PitchTheme = "stadium";
  private prevBallSpeed = 0;

  constructor() { super("match"); }

  init(data: { room: Room; theme?: PitchTheme }) {
    this.room = data.room;
    this.mySessionId = data.room.sessionId;
    this.theme = data.theme ?? "stadium";
  }

  create() {
    ensureBallTexture(this);
    this.makeSpark();
    drawStadium(this, this.theme);
    drawPitch(this, this.theme);
    drawAdBoards(this);
    this.buildScoreboard();

    this.ballShadow = this.add.ellipse(FIELD.WIDTH / 2, FIELD.HEIGHT / 2 + 10, 22, 9, 0x000000, 0.28).setDepth(4);
    this.ball = this.add.image(FIELD.WIDTH / 2, FIELD.HEIGHT / 2, "ball_tex").setDepth(20);

    this.banner = this.add.text(FIELD.WIDTH / 2, FIELD.HEIGHT / 2, "", {
      fontFamily: "Arial Black, Arial", fontSize: "64px", color: "#ffd23f", align: "center",
    }).setOrigin(0.5).setStroke("#1a141b", 10).setShadow(0, 4, "#000000", 6).setDepth(200);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.UP), down: kb.addKey(K.DOWN), left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT),
      w: kb.addKey(K.W), a: kb.addKey(K.A), s: kb.addKey(K.S), d: kb.addKey(K.D), kick: kb.addKey(K.SPACE),
    };

  }

  update(_time: number, delta: number) {
    const state: any = this.room.state;
    // Colyseus populates the schema over the first few patches; bail until ready.
    // An uncaught throw here would permanently halt Phaser's game loop.
    if (!state || !state.players || !state.ball) return;
    this.syncPlayers(state, delta);
    this.syncBall(state, delta);
    this.syncHud(state);
    this.detectEvents(state);
    if (state.phase === "playing") this.sendInput();
  }

  private detectEvents(state: any) {
    // Remember which team is mine (for win/lose sounds at full time).
    if (!this.myTeam) {
      const me = state.players.get(this.mySessionId);
      if (me) this.myTeam = me.team;
    }

    if (state.scoreBlue > this.prevScoreBlue) this.celebrateGoal("blue");
    if (state.scoreOrange > this.prevScoreOrange) this.celebrateGoal("orange");
    this.prevScoreBlue = state.scoreBlue;
    this.prevScoreOrange = state.scoreOrange;

    if (state.phase !== this.prevPhase) {
      if (this.prevPhase === "countdown" && state.phase === "playing") playWhistle();
      if (state.phase === "ended") {
        const win =
          this.myTeam === "blue" ? state.scoreBlue > state.scoreOrange
          : this.myTeam === "orange" ? state.scoreOrange > state.scoreBlue
          : state.scoreBlue !== state.scoreOrange;
        playMatchEnd(win);
      }
      this.prevPhase = state.phase;
    }
  }

  private celebrateGoal(team: "blue" | "orange") {
    playGoal();
    const color = team === "blue" ? 0x5a82ff : 0xff9526;
    const hex = team === "blue" ? "#5a82ff" : "#ff9526";
    const cx = FIELD.WIDTH / 2, cy = FIELD.HEIGHT / 2;

    const cam = this.cameras.main;
    cam.flash(260, (color >> 16) & 255, (color >> 8) & 255, color & 255);
    cam.shake(320, 0.012);

    // Confetti burst from the centre.
    const burst = this.add.particles(cx, cy, "spark", {
      speed: { min: 220, max: 560 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      lifespan: 950,
      gravityY: 420,
      quantity: 1,
      tint: [0xffd23f, color, 0xffffff, 0x2fe88a],
      emitting: false,
    }).setDepth(290);
    burst.explode(70);
    this.time.delayedCall(1100, () => burst.destroy());

    // Big bouncing GOAL! text.
    const label = this.add.text(cx, cy, "GOAL!", {
      fontFamily: "Arial Black, Arial", fontSize: "130px", color: hex,
    }).setOrigin(0.5).setStroke("#0b0b1a", 14).setShadow(0, 6, "#000000", 8)
      .setDepth(300).setScale(0).setAngle(-8);
    this.tweens.add({ targets: label, scale: 1, duration: 420, ease: "Back.out" });
    this.tweens.add({ targets: label, angle: 8, duration: 600, yoyo: true, repeat: 1, ease: "Sine.inOut" });
    this.tweens.add({ targets: label, alpha: 0, scale: 1.5, delay: 1100, duration: 380,
      onComplete: () => label.destroy() });
  }

  private makeSpark() {
    if (this.textures.exists("spark")) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 6, 6);
    g.generateTexture("spark", 6, 6);
    g.destroy();
  }

  private sendInput() {
    let dx = 0, dy = 0, kick = false;
    // While typing in the chat box, hold still and don't kick.
    if (!isTyping()) {
      if (this.keys.left.isDown || this.keys.a.isDown) dx -= 1;
      if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
      if (this.keys.up.isDown || this.keys.w.isDown) dy -= 1;
      if (this.keys.down.isDown || this.keys.s.isDown) dy += 1;
      kick = Phaser.Input.Keyboard.JustDown(this.keys.kick);
    }
    if (kick) {
      const me = this.playerSprites.get(this.mySessionId);
      if (me) this.kickFx(me.x, me.y, me.facing);
      playKick();
    }
    const msg: InputMessage = { dx, dy, kick, seq: ++this.seq };
    this.room.send("input", msg);
  }

  /** Player swing effect when you press kick. */
  private kickFx(x: number, y: number, facing: number) {
    const ring = this.add.circle(x, y + 8, 12).setStrokeStyle(3, 0xffffff, 0.85).setDepth(60);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 260, ease: "Cubic.out", onComplete: () => ring.destroy() });
    const puff = this.add.particles(x + facing * 16, y, "spark", {
      speedX: { min: facing * 140, max: facing * 340 }, speedY: { min: -90, max: 90 },
      lifespan: 320, scale: { start: 1, end: 0 }, quantity: 1,
      tint: [0xffffff, 0xffd23f], emitting: false,
    }).setDepth(60);
    puff.explode(10);
    this.time.delayedCall(360, () => puff.destroy());
  }

  /** Impact burst when the ball is struck hard. */
  private ballImpactFx(x: number, y: number) {
    const ring = this.add.circle(x, y, 10).setStrokeStyle(4, 0xffd23f, 0.95).setDepth(60);
    this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 320, ease: "Cubic.out", onComplete: () => ring.destroy() });
    const burst = this.add.particles(x, y, "spark", {
      speed: { min: 140, max: 360 }, angle: { min: 0, max: 360 },
      lifespan: 380, scale: { start: 1, end: 0 }, quantity: 1,
      tint: [0xffffff, 0xffd23f, 0xff9526], emitting: false,
    }).setDepth(61);
    burst.explode(14);
    this.time.delayedCall(420, () => burst.destroy());
    this.cameras.main.shake(90, 0.004);
  }

  private syncPlayers(state: any, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    const seen = new Set<string>();
    state.players.forEach((p: any, id: string) => {
      seen.add(id);
      let c = this.playerSprites.get(id);
      if (!c) c = this.makePlayer(id, p);

      // Dead reckoning: advance by the authoritative velocity each frame, then
      // gently correct toward the authoritative position. This keeps motion
      // continuous between 30Hz server updates (much smoother than lerp-to-point).
      c.x = Phaser.Math.Linear(c.x + p.vx * dt, p.x, 0.16);
      c.y = Phaser.Math.Linear(c.y + p.vy * dt, p.y, 0.16);
      c.setDepth(10 + c.y / 100);

      const speed = Math.hypot(p.vx, p.vy);
      if (Math.abs(p.vx) > 8) c.facing = p.vx > 0 ? 1 : -1;
      c.sprite.setScale(c.facing * CHAR_SCALE, CHAR_SCALE);

      // Walk cycle when moving; gentle idle bob otherwise.
      if (speed > 12) {
        c.animClock += delta;
        const seqFrame = [1, 0, 2, 0];
        const frame = seqFrame[Math.floor(c.animClock / 110) % 4];
        c.sprite.setTexture(`${c.texPrefix}_${frame}`);
        c.sprite.y = -2;
      } else {
        c.animClock = 0;
        c.sprite.setTexture(`${c.texPrefix}_0`);
        c.sprite.y = Math.sin(this.time.now / 320) * 1.2;
      }
    });
    for (const [id, c] of this.playerSprites) {
      if (!seen.has(id)) { c.destroy(); this.playerSprites.delete(id); }
    }
  }

  private makePlayer(id: string, p: any): PlayerView {
    const team = p.team as "blue" | "orange";
    const prefix = ensurePlayerTextures(this, team, variantFor(id));
    const isMe = id === this.mySessionId;

    const shadow = this.add.ellipse(0, 22, 30, 11, 0x000000, 0.3);
    const sprite = this.add.image(0, 0, `${prefix}_0`).setOrigin(0.5, 0.78);
    sprite.setScale(CHAR_SCALE);

    const ring = isMe ? this.add.ellipse(0, 22, 40, 16).setStrokeStyle(3, 0xffd23f) : null;
    const name = this.add.text(0, -42, isMe ? "YOU" : (p.name || "P"), {
      fontFamily: "Arial Black, Arial", fontSize: "13px",
      color: isMe ? "#ffd23f" : "#ffffff", backgroundColor: "#000000aa",
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setResolution(2);

    const parts: Phaser.GameObjects.GameObject[] = [shadow];
    if (ring) parts.push(ring);
    parts.push(sprite, name);

    const c = this.add.container(p.x, p.y, parts) as PlayerView;
    c.sprite = sprite;
    c.prevX = p.x; c.prevY = p.y;
    c.animClock = 0; c.facing = 1; c.texPrefix = prefix;
    this.playerSprites.set(id, c);
    return c;
  }

  private syncBall(state: any, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);
    const nx = Phaser.Math.Linear(this.ball.x + state.ball.vx * dt, state.ball.x, 0.22);
    const ny = Phaser.Math.Linear(this.ball.y + state.ball.vy * dt, state.ball.y, 0.22);
    this.ball.setPosition(nx, ny);
    this.ball.rotation += state.ball.vx * 0.0006;
    this.ballShadow.setPosition(nx, ny + 11);
    const sp = Math.hypot(state.ball.vx, state.ball.vy);
    this.ballShadow.setScale(1 + Math.min(sp / 2000, 0.4), 1);

    // A sudden jump in ball speed means it was struck — pop an impact effect.
    if (sp - this.prevBallSpeed > 220) this.ballImpactFx(state.ball.x, state.ball.y);
    this.prevBallSpeed = sp;
  }

  private syncHud(state: any) {
    this.scoreText.setText(`${state.scoreBlue}   ${state.scoreOrange}`);
    this.timeText.setText(fmtTime(state.timeLeft));
    if (state.phase === "lobby") {
      this.banner.setText(`WAITING FOR PLAYERS\n${state.players.size} / ${state.playersToStart || MATCH.PLAYERS_TO_START}`);
    } else if (state.phase === "countdown") {
      this.banner.setText(state.countdown > 0 ? `${state.countdown}` : "GO!");
    } else if (state.phase === "playing") {
      this.banner.setText("");
    } else if (state.phase === "ended") {
      const txt =
        state.scoreBlue > state.scoreOrange ? "BLUE TEAM WINS!"
        : state.scoreOrange > state.scoreBlue ? "ORANGE TEAM WINS!"
        : "DRAW";
      this.banner.setText(`${txt}\n${state.scoreBlue} - ${state.scoreOrange}`);
    }
  }

  private buildScoreboard() {
    const w = 300, h = 64, x = FIELD.WIDTH / 2 - w / 2, y = 8;
    const g = this.add.graphics().setDepth(150);
    g.fillStyle(0x12101a, 0.92);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(3, 0xffd23f, 1);
    g.strokeRoundedRect(x, y, w, h, 10);
    // team color chips
    g.fillStyle(0x3a64ff, 1); g.fillRoundedRect(x + 12, y + 16, 32, 32, 6);
    g.fillStyle(0xff9526, 1); g.fillRoundedRect(x + w - 44, y + 16, 32, 32, 6);

    this.scoreText = this.add.text(FIELD.WIDTH / 2, y + 14, "0   0", {
      fontFamily: "Arial Black, Arial", fontSize: "30px", color: "#ffffff",
    }).setOrigin(0.5, 0).setDepth(151);
    this.timeText = this.add.text(FIELD.WIDTH / 2, y + 44, "01:30", {
      fontFamily: "Courier New", fontSize: "16px", color: "#ffd23f",
    }).setOrigin(0.5, 0).setDepth(151);
  }

}

function isTyping(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}
function fmtTime(s: number) {
  const m = Math.floor(Math.max(0, s) / 60);
  const ss = Math.max(0, s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
