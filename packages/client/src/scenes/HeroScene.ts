import Phaser from "phaser";
import { FIELD } from "@pixel-pitch/shared";
import { CHAR_SCALE, ensureBallTexture, ensurePlayerTextures, variantFor } from "./sprites";
import { drawStadium, drawPitch, drawAdBoards } from "./field";

// A self-contained, server-free demo match used as the animated landing hero.
// Bots chase and kick a ball around the real pitch so the homepage shows the
// actual game look, "live."

const LEFT = FIELD.MARGIN, RIGHT = FIELD.WIDTH - FIELD.MARGIN;
const TOP = FIELD.MARGIN, BOTTOM = FIELD.HEIGHT - FIELD.MARGIN;
const GOAL_TOP = FIELD.HEIGHT / 2 - FIELD.GOAL_HEIGHT / 2;
const GOAL_BOTTOM = FIELD.HEIGHT / 2 + FIELD.GOAL_HEIGHT / 2;
const SPEED = 165;
const PR = 18, BR = 12;

interface Bot {
  c: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  team: "blue" | "orange";
  x: number; y: number; vx: number; vy: number;
  homeX: number; homeY: number;
  prefix: string; facing: number; animClock: number; phase: number;
}

export class HeroScene extends Phaser.Scene {
  private bots: Bot[] = [];
  private ball!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private bx = FIELD.WIDTH / 2; private by = FIELD.HEIGHT / 2; private bvx = 120; private bvy = 60;

  constructor() { super("hero"); }

  create() {
    ensureBallTexture(this);
    drawStadium(this, "stadium");
    drawPitch(this, "stadium");
    drawAdBoards(this);

    this.ballShadow = this.add.ellipse(this.bx, this.by + 11, 22, 9, 0x000000, 0.28).setDepth(4);
    this.ball = this.add.image(this.bx, this.by, "ball_tex").setDepth(20);

    const blueXs = FIELD.WIDTH * 0.32, orangeXs = FIELD.WIDTH * 0.68;
    const ys = [0.3, 0.5, 0.7].map((f) => FIELD.HEIGHT * f);
    ys.forEach((y, i) => { this.spawn("blue", blueXs, y, i); this.spawn("orange", orangeXs, y, i + 3); });
  }

  private spawn(team: "blue" | "orange", x: number, y: number, seed: number) {
    const prefix = ensurePlayerTextures(this, team, variantFor(`hero${team}${seed}`));
    const shadow = this.add.ellipse(0, 22, 30, 11, 0x000000, 0.3);
    const sprite = this.add.image(0, 0, `${prefix}_0`).setOrigin(0.5, 0.78).setScale(CHAR_SCALE);
    const c = this.add.container(x, y, [shadow, sprite]);
    this.bots.push({ c, sprite, team, x, y, vx: 0, vy: 0, homeX: x, homeY: y, prefix, facing: team === "blue" ? 1 : -1, animClock: 0, phase: seed });
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05);

    for (const team of ["blue", "orange"] as const) {
      const mates = this.bots.filter((b) => b.team === team);
      mates.sort((a, b) => this.d2(a) - this.d2(b));
      const chaser = mates[0];
      const oppGoalX = team === "blue" ? RIGHT : LEFT;
      const ownGoalX = team === "blue" ? LEFT : RIGHT;

      mates.forEach((b) => {
        let tx: number, ty: number;
        if (b === chaser) {
          const toward = Math.sign(oppGoalX - ownGoalX);
          tx = this.bx - toward * (PR + BR);
          ty = this.by;
        } else {
          // hold formation between ball and own goal, with a gentle sway
          tx = ownGoalX * 0.5 + this.bx * 0.5 + (b.homeX - FIELD.WIDTH / 2) * 0.3;
          ty = b.homeY + Math.sin(time / 900 + b.phase) * 50;
        }
        this.steer(b, tx, ty, dt);
        this.animate(b, time, delta);
      });
    }

    this.updateBall(dt);
  }

  private steer(b: Bot, tx: number, ty: number, dt: number) {
    const dx = tx - b.x, dy = ty - b.y;
    const m = Math.hypot(dx, dy) || 1;
    const desX = (dx / m) * SPEED, desY = (dy / m) * SPEED;
    b.vx = Phaser.Math.Linear(b.vx, m < 6 ? 0 : desX, 0.08);
    b.vy = Phaser.Math.Linear(b.vy, m < 6 ? 0 : desY, 0.08);
    b.x = Phaser.Math.Clamp(b.x + b.vx * dt, LEFT + PR, RIGHT - PR);
    b.y = Phaser.Math.Clamp(b.y + b.vy * dt, TOP + PR, BOTTOM - PR);
    // kick the ball if close
    const bdx = this.bx - b.x, bdy = this.by - b.y;
    const bd = Math.hypot(bdx, bdy);
    if (bd < PR + BR + 4) {
      const oppGoalX = b.team === "blue" ? RIGHT : LEFT;
      const gdx = oppGoalX - this.bx, gdy = FIELD.HEIGHT / 2 - this.by;
      const gm = Math.hypot(gdx, gdy) || 1;
      const power = 280 + Math.random() * 120;
      this.bvx = (gdx / gm) * power + (Math.random() - 0.5) * 120;
      this.bvy = (gdy / gm) * power + (Math.random() - 0.5) * 160;
    }
  }

  private animate(b: Bot, time: number, delta: number) {
    b.c.x = b.x; b.c.y = b.y;
    b.c.setDepth(10 + b.y / 100);
    const speed = Math.hypot(b.vx, b.vy);
    if (Math.abs(b.vx) > 4) b.facing = b.vx > 0 ? 1 : -1;
    b.sprite.setScale(b.facing * CHAR_SCALE, CHAR_SCALE);
    if (speed > 12) {
      b.animClock += delta;
      const frame = [1, 0, 2, 0][Math.floor(b.animClock / 120) % 4];
      b.sprite.setTexture(`${b.prefix}_${frame}`);
      b.sprite.y = -2;
    } else {
      b.sprite.setTexture(`${b.prefix}_0`);
      b.sprite.y = Math.sin(time / 320 + b.phase) * 1.2;
    }
  }

  private updateBall(dt: number) {
    this.bvx *= 0.985; this.bvy *= 0.985;
    const sp = Math.hypot(this.bvx, this.bvy);
    if (sp > 620) { this.bvx = (this.bvx / sp) * 620; this.bvy = (this.bvy / sp) * 620; }
    this.bx += this.bvx * dt; this.by += this.bvy * dt;

    if (this.by < TOP + BR) { this.by = TOP + BR; this.bvy = Math.abs(this.bvy) * 0.8; }
    else if (this.by > BOTTOM - BR) { this.by = BOTTOM - BR; this.bvy = -Math.abs(this.bvy) * 0.8; }

    const inGoal = this.by > GOAL_TOP && this.by < GOAL_BOTTOM;
    if (this.bx < LEFT + BR) { if (inGoal) return this.kickoff(); this.bx = LEFT + BR; this.bvx = Math.abs(this.bvx) * 0.8; }
    else if (this.bx > RIGHT - BR) { if (inGoal) return this.kickoff(); this.bx = RIGHT - BR; this.bvx = -Math.abs(this.bvx) * 0.8; }

    this.ball.setPosition(this.bx, this.by);
    this.ball.rotation += this.bvx * 0.0006;
    this.ballShadow.setPosition(this.bx, this.by + 11);
  }

  private kickoff() {
    this.bx = FIELD.WIDTH / 2; this.by = FIELD.HEIGHT / 2;
    const a = Math.random() * Math.PI * 2;
    this.bvx = Math.cos(a) * 160; this.bvy = Math.sin(a) * 120;
    this.ball.setPosition(this.bx, this.by);
  }

  private d2(b: Bot) {
    const dx = b.x - this.bx, dy = b.y - this.by;
    return dx * dx + dy * dy;
  }
}
