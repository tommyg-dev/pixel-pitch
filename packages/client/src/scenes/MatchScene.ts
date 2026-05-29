import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { FIELD, MATCH, type InputMessage } from "@pixel-pitch/shared";
import { CHAR_SCALE, ensureBallTexture, ensurePlayerTextures, variantFor } from "./sprites";
import { playGoal, playWhistle, playMatchEnd } from "../sound";

const GRASS_LIGHT = 0x4aa83f;
const GRASS_DARK = 0x3f9a37;
const SURROUND = 0x2c6e2a;
const LINE = 0xf2fff2;

const STAND_BASE = 0x201b38;
const STAND_DARK = 0x14102a;
const CROWD = [
  0xe8b88a, 0xc98b54, 0x8a5a32, 0xffd23f, 0xe34b4b, 0x4f7bff,
  0x2fe88a, 0xffffff, 0xff9526, 0xb15bd8, 0xcfd2e8, 0x3a3a4a,
];
// Perimeter advertising boards (crypto/retro themed).
const ADS_TOP = [
  { t: "$PITCH", c: 0xffd23f, fg: "#1a1030" },
  { t: "SOLANA", c: 0x14f195, fg: "#062b1d" },
  { t: "PHANTOM", c: 0xab9ff2, fg: "#1a1030" },
  { t: "PUMP.FUN", c: 0x2fe88a, fg: "#06251a" },
  { t: "SOLFLARE", c: 0xffae35, fg: "#3a1f00" },
  { t: "WAGMI", c: 0xff4fd8, fg: "#2a0030" },
];
const ADS_BOTTOM = [
  { t: "GM", c: 0x5a82ff, fg: "#06122e" },
  { t: "DEGEN", c: 0xff6b6b, fg: "#2e0606" },
  { t: "HODL", c: 0x2fe88a, fg: "#06251a" },
  { t: "8-BIT FC", c: 0xffd23f, fg: "#1a1030" },
  { t: "TO THE MOON", c: 0xb15bd8, fg: "#1a0030" },
  { t: "$PITCH", c: 0xffffff, fg: "#1a1030" },
];

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

  constructor() { super("match"); }

  init(data: { room: Room }) {
    this.room = data.room;
    this.mySessionId = data.room.sessionId;
  }

  create() {
    ensureBallTexture(this);
    this.makeSpark();
    this.drawStadium();
    this.drawField();
    this.drawAdBoards();
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
    this.syncBall(state);
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
    let dx = 0, dy = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) dx -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) dx += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) dy -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) dy += 1;
    const kick = Phaser.Input.Keyboard.JustDown(this.keys.kick);
    const msg: InputMessage = { dx, dy, kick, seq: ++this.seq };
    this.room.send("input", msg);
  }

  private syncPlayers(state: any, delta: number) {
    const seen = new Set<string>();
    state.players.forEach((p: any, id: string) => {
      seen.add(id);
      let c = this.playerSprites.get(id);
      if (!c) c = this.makePlayer(id, p);

      const tx = p.x, ty = p.y;
      const movedX = tx - c.prevX;
      const speed = Math.hypot(tx - c.prevX, ty - c.prevY);
      c.prevX = tx; c.prevY = ty;

      c.x = Phaser.Math.Linear(c.x, tx, 0.35);
      c.y = Phaser.Math.Linear(c.y, ty, 0.35);
      c.setDepth(10 + c.y / 100);

      if (Math.abs(movedX) > 0.2) c.facing = movedX > 0 ? 1 : -1;
      c.sprite.setScale(c.facing * CHAR_SCALE, CHAR_SCALE);

      // Walk cycle when moving; gentle idle bob otherwise.
      if (speed > 0.6) {
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

  private syncBall(state: any) {
    const nx = Phaser.Math.Linear(this.ball.x, state.ball.x, 0.5);
    const ny = Phaser.Math.Linear(this.ball.y, state.ball.y, 0.5);
    this.ball.setPosition(nx, ny);
    this.ball.rotation += state.ball.vx * 0.0006;
    this.ballShadow.setPosition(nx, ny + 11);
    const sp = Math.hypot(state.ball.vx, state.ball.vy);
    this.ballShadow.setScale(1 + Math.min(sp / 2000, 0.4), 1);
  }

  private syncHud(state: any) {
    this.scoreText.setText(`${state.scoreBlue}   ${state.scoreOrange}`);
    this.timeText.setText(fmtTime(state.timeLeft));
    if (state.phase === "lobby") {
      this.banner.setText(`WAITING FOR PLAYERS\n${state.players.size} / ${MATCH.PLAYERS_TO_START}`);
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

  private drawStadium() {
    const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
    const g = this.add.graphics();
    g.fillStyle(STAND_BASE, 1);
    g.fillRect(0, 0, W, H);
    // Crowd fills the four bands around the pitch.
    this.drawCrowdBand(g, 0, 0, W, M, true);
    this.drawCrowdBand(g, 0, H - M, W, M, true);
    this.drawCrowdBand(g, 0, M, M, H - M * 2, false);
    this.drawCrowdBand(g, W - M, M, M, H - M * 2, false);
  }

  private drawCrowdBand(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, horizontal: boolean) {
    g.fillStyle(STAND_BASE, 1);
    g.fillRect(x, y, w, h);
    // tier/row separators for a seated-stands feel
    g.fillStyle(STAND_DARK, 0.6);
    if (horizontal) for (let ry = y + 9; ry < y + h; ry += 13) g.fillRect(x, ry, w, 2);
    else for (let rx = x + 9; rx < x + w; rx += 13) g.fillRect(rx, y, 2, h);
    // scattered spectator heads
    const step = 10;
    for (let gy = y + 3; gy < y + h - 4; gy += step) {
      for (let gx = x + 3; gx < x + w - 4; gx += step) {
        const c = CROWD[(Math.random() * CROWD.length) | 0];
        const jx = (Math.random() * 3) | 0;
        const jy = (Math.random() * 3) | 0;
        g.fillStyle(c, 1);
        g.fillRect(gx + jx, gy + jy, 5, 5);
      }
    }
  }

  private drawAdBoards() {
    const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
    const innerW = W - M * 2;
    const n = ADS_TOP.length, gap = 6, bh = 18;
    const pw = (innerW - gap * (n - 1)) / n;

    const row = (ads: typeof ADS_TOP, by: number) => {
      const g = this.add.graphics().setDepth(3);
      ads.forEach((ad, i) => {
        const x = M + i * (pw + gap);
        g.fillStyle(0x0c0a18, 1);
        g.fillRect(x - 1, by + bh - 2, pw + 2, 3); // base shadow / stand
        g.fillStyle(ad.c, 1);
        g.fillRoundedRect(x, by, pw, bh, 3);
        this.add.text(x + pw / 2, by + bh / 2, ad.t, {
          fontFamily: "Arial Black, Arial", fontSize: "13px", color: ad.fg,
        }).setOrigin(0.5).setDepth(4).setResolution(2);
      });
    };
    row(ADS_TOP, M - 24);
    row(ADS_BOTTOM, H - M + 6);
  }

  private drawField() {
    const g = this.add.graphics();
    const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
    const innerW = W - M * 2, innerH = H - M * 2;

    // grass surround strip (between the ad boards and the touchline)
    const GB = 20;
    g.fillStyle(SURROUND, 1);
    g.fillRect(M - GB, M - GB, innerW + GB * 2, innerH + GB * 2);

    // mowed stripes
    const stripes = 12;
    const sw = innerW / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle(i % 2 ? GRASS_DARK : GRASS_LIGHT, 1);
      g.fillRect(M + i * sw, M, sw, innerH);
    }

    g.lineStyle(3, LINE, 0.95);
    // boundary
    g.strokeRect(M, M, innerW, innerH);
    // halfway + centre
    g.beginPath(); g.moveTo(W / 2, M); g.lineTo(W / 2, H - M); g.strokePath();
    g.strokeCircle(W / 2, H / 2, 64);
    dot(g, W / 2, H / 2);

    // penalty + goal areas, both ends
    const penW = 130, penH = 320, goalAreaW = 54, goalAreaH = 180, spot = 90;
    const penY = H / 2 - penH / 2, gaY = H / 2 - goalAreaH / 2;
    // left
    g.strokeRect(M, penY, penW, penH);
    g.strokeRect(M, gaY, goalAreaW, goalAreaH);
    dot(g, M + spot, H / 2);
    arc(g, M + spot, H / 2, 52, -55, 55);
    // right
    g.strokeRect(W - M - penW, penY, penW, penH);
    g.strokeRect(W - M - goalAreaW, gaY, goalAreaW, goalAreaH);
    dot(g, W - M - spot, H / 2);
    arc(g, W - M - spot, H / 2, 52, 125, 235);

    // corner arcs
    cornerArc(g, M, M, 0, 90);
    cornerArc(g, W - M, M, 90, 180);
    cornerArc(g, M, H - M, 270, 360);
    cornerArc(g, W - M, H - M, 180, 270);

    // goals with nets
    this.drawGoal(M - FIELD.GOAL_WIDTH, true);
    this.drawGoal(W - M, false);
  }

  private drawGoal(x: number, left: boolean) {
    const gy = FIELD.HEIGHT / 2 - FIELD.GOAL_HEIGHT / 2;
    const gw = FIELD.GOAL_WIDTH, gh = FIELD.GOAL_HEIGHT;
    const net = this.add.graphics();
    net.fillStyle(0xffffff, 0.10);
    net.fillRect(x, gy, gw, gh);
    net.lineStyle(1, 0xffffff, 0.4);
    for (let i = 0; i <= gw; i += 6) { net.beginPath(); net.moveTo(x + i, gy); net.lineTo(x + i, gy + gh); net.strokePath(); }
    for (let j = 0; j <= gh; j += 6) { net.beginPath(); net.moveTo(x, gy + j); net.lineTo(x + gw, gy + j); net.strokePath(); }
    net.lineStyle(4, 0xffffff, 1);
    net.strokeRect(x, gy, gw, gh);
    // goal posts highlight on the goal-line side
    net.lineStyle(5, left ? 0xeef2ff : 0xfff3e6, 1);
    const lx = left ? x + gw : x;
    net.beginPath(); net.moveTo(lx, gy); net.lineTo(lx, gy + gh); net.strokePath();
  }
}

function dot(g: Phaser.GameObjects.Graphics, x: number, y: number) {
  g.fillStyle(LINE, 0.95); g.fillCircle(x, y, 3);
}
function arc(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, a0: number, a1: number) {
  g.beginPath();
  g.arc(x, y, r, Phaser.Math.DegToRad(a0), Phaser.Math.DegToRad(a1), false);
  g.strokePath();
}
function cornerArc(g: Phaser.GameObjects.Graphics, x: number, y: number, a0: number, a1: number) {
  g.beginPath();
  g.arc(x, y, 14, Phaser.Math.DegToRad(a0), Phaser.Math.DegToRad(a1), false);
  g.strokePath();
}
function fmtTime(s: number) {
  const m = Math.floor(Math.max(0, s) / 60);
  const ss = Math.max(0, s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
