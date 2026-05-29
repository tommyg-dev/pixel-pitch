import Phaser from "phaser";
import { FIELD } from "@pixel-pitch/shared";

// Shared pitch/stadium rendering used by both the live match and the hero demo,
// so they always look identical.

export const GRASS_LIGHT = 0x4aa83f;
export const GRASS_DARK = 0x3f9a37;
export const SURROUND = 0x2c6e2a;
const LINE = 0xf2fff2;

const STAND_BASE = 0x201b38;
const STAND_DARK = 0x14102a;
const CROWD = [
  0xe8b88a, 0xc98b54, 0x8a5a32, 0xffd23f, 0xe34b4b, 0x4f7bff,
  0x2fe88a, 0xffffff, 0xff9526, 0xb15bd8, 0xcfd2e8, 0x3a3a4a,
];
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

export function drawStadium(scene: Phaser.Scene) {
  const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
  const g = scene.add.graphics();
  g.fillStyle(STAND_BASE, 1);
  g.fillRect(0, 0, W, H);
  crowdBand(g, 0, 0, W, M, true);
  crowdBand(g, 0, H - M, W, M, true);
  crowdBand(g, 0, M, M, H - M * 2, false);
  crowdBand(g, W - M, M, M, H - M * 2, false);
}

function crowdBand(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, horizontal: boolean) {
  g.fillStyle(STAND_BASE, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(STAND_DARK, 0.6);
  if (horizontal) for (let ry = y + 9; ry < y + h; ry += 13) g.fillRect(x, ry, w, 2);
  else for (let rx = x + 9; rx < x + w; rx += 13) g.fillRect(rx, y, 2, h);
  const step = 10;
  for (let gy = y + 3; gy < y + h - 4; gy += step) {
    for (let gx = x + 3; gx < x + w - 4; gx += step) {
      const c = CROWD[(Math.random() * CROWD.length) | 0];
      g.fillStyle(c, 1);
      g.fillRect(gx + ((Math.random() * 3) | 0), gy + ((Math.random() * 3) | 0), 5, 5);
    }
  }
}

export function drawAdBoards(scene: Phaser.Scene) {
  const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
  const innerW = W - M * 2;
  const n = ADS_TOP.length, gap = 6, bh = 18;
  const pw = (innerW - gap * (n - 1)) / n;
  const row = (ads: typeof ADS_TOP, by: number) => {
    const g = scene.add.graphics().setDepth(3);
    ads.forEach((ad, i) => {
      const x = M + i * (pw + gap);
      g.fillStyle(0x0c0a18, 1);
      g.fillRect(x - 1, by + bh - 2, pw + 2, 3);
      g.fillStyle(ad.c, 1);
      g.fillRoundedRect(x, by, pw, bh, 3);
      scene.add.text(x + pw / 2, by + bh / 2, ad.t, {
        fontFamily: "Arial Black, Arial", fontSize: "13px", color: ad.fg,
      }).setOrigin(0.5).setDepth(4).setResolution(2);
    });
  };
  row(ADS_TOP, M - 24);
  row(ADS_BOTTOM, H - M + 6);
}

export function drawPitch(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
  const innerW = W - M * 2, innerH = H - M * 2;

  const GB = 20;
  g.fillStyle(SURROUND, 1);
  g.fillRect(M - GB, M - GB, innerW + GB * 2, innerH + GB * 2);

  const stripes = 12;
  const sw = innerW / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 ? GRASS_DARK : GRASS_LIGHT, 1);
    g.fillRect(M + i * sw, M, sw, innerH);
  }

  g.lineStyle(3, LINE, 0.95);
  g.strokeRect(M, M, innerW, innerH);
  g.beginPath(); g.moveTo(W / 2, M); g.lineTo(W / 2, H - M); g.strokePath();
  g.strokeCircle(W / 2, H / 2, 64);
  dot(g, W / 2, H / 2);

  const penW = 130, penH = 320, goalAreaW = 54, goalAreaH = 180, spot = 90;
  const penY = H / 2 - penH / 2, gaY = H / 2 - goalAreaH / 2;
  g.strokeRect(M, penY, penW, penH);
  g.strokeRect(M, gaY, goalAreaW, goalAreaH);
  dot(g, M + spot, H / 2);
  arc(g, M + spot, H / 2, 52, -55, 55);
  g.strokeRect(W - M - penW, penY, penW, penH);
  g.strokeRect(W - M - goalAreaW, gaY, goalAreaW, goalAreaH);
  dot(g, W - M - spot, H / 2);
  arc(g, W - M - spot, H / 2, 52, 125, 235);

  cornerArc(g, M, M, 0, 90);
  cornerArc(g, W - M, M, 90, 180);
  cornerArc(g, M, H - M, 270, 360);
  cornerArc(g, W - M, H - M, 180, 270);

  drawGoal(scene, M - FIELD.GOAL_WIDTH, true);
  drawGoal(scene, W - M, false);
}

function drawGoal(scene: Phaser.Scene, x: number, left: boolean) {
  const gy = FIELD.HEIGHT / 2 - FIELD.GOAL_HEIGHT / 2;
  const gw = FIELD.GOAL_WIDTH, gh = FIELD.GOAL_HEIGHT;
  const net = scene.add.graphics();
  net.fillStyle(0xffffff, 0.1);
  net.fillRect(x, gy, gw, gh);
  net.lineStyle(1, 0xffffff, 0.4);
  for (let i = 0; i <= gw; i += 6) { net.beginPath(); net.moveTo(x + i, gy); net.lineTo(x + i, gy + gh); net.strokePath(); }
  for (let j = 0; j <= gh; j += 6) { net.beginPath(); net.moveTo(x, gy + j); net.lineTo(x + gw, gy + j); net.strokePath(); }
  net.lineStyle(4, 0xffffff, 1);
  net.strokeRect(x, gy, gw, gh);
  net.lineStyle(5, left ? 0xeef2ff : 0xfff3e6, 1);
  const lx = left ? x + gw : x;
  net.beginPath(); net.moveTo(lx, gy); net.lineTo(lx, gy + gh); net.strokePath();
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
