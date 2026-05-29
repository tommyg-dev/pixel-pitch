import Phaser from "phaser";
import { FIELD } from "@pixel-pitch/shared";

// Shared pitch rendering with swappable themes:
//   stadium -> classic green grass + crowd (3v3)
//   street  -> grey concrete cage + chain-link fence + graffiti (1v1)
//   neon    -> dark futsal court with glowing neon lines (AI bots)

export type PitchTheme = "stadium" | "street" | "neon";

interface ThemeCfg {
  base: number; dark: number; surround: number;
  surfA: number; surfB: number; line: number;
}
const THEMES: Record<PitchTheme, ThemeCfg> = {
  stadium: { base: 0x201b38, dark: 0x14102a, surround: 0x2c6e2a, surfA: 0x4aa83f, surfB: 0x3f9a37, line: 0xf2fff2 },
  street:  { base: 0x2b2b33, dark: 0x1b1b21, surround: 0x3a3a42, surfA: 0x70707a, surfB: 0x64646e, line: 0xe2e6ee },
  neon:    { base: 0x090720, dark: 0x05030f, surround: 0x140a30, surfA: 0x241653, surfB: 0x1b0f43, line: 0x36e8ff },
};

const CROWD = [
  0xe8b88a, 0xc98b54, 0x8a5a32, 0xffd23f, 0xe34b4b, 0x4f7bff,
  0x2fe88a, 0xffffff, 0xff9526, 0xb15bd8, 0xcfd2e8, 0x3a3a4a,
];
const GRAFFITI = [0xff4fd8, 0x2fe88a, 0xffd23f, 0x5a82ff, 0xff6b6b, 0xab9ff2];
const NEON = [0x36e8ff, 0xff4fd8, 0x2fe88a, 0xffd23f];

const ADS_TOP = [
  { t: "$KFi", c: 0xffd23f, fg: "#1a1030" },
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
  { t: "$KFi", c: 0xffffff, fg: "#1a1030" },
];

// ---------- surround / stands ----------
export function drawStadium(scene: Phaser.Scene, theme: PitchTheme = "stadium") {
  const t = THEMES[theme];
  const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
  const g = scene.add.graphics();
  g.fillStyle(t.base, 1);
  g.fillRect(0, 0, W, H);
  const bands: [number, number, number, number, boolean][] = [
    [0, 0, W, M, true], [0, H - M, W, M, true],
    [0, M, M, H - M * 2, false], [W - M, M, M, H - M * 2, false],
  ];
  for (const [x, y, w, h, horiz] of bands) {
    if (theme === "stadium") crowdBand(g, t, x, y, w, h, horiz);
    else if (theme === "street") fenceBand(g, t, x, y, w, h, horiz);
    else neonBand(g, t, x, y, w, h, horiz);
  }
}

function crowdBand(g: Phaser.GameObjects.Graphics, t: ThemeCfg, x: number, y: number, w: number, h: number, horiz: boolean) {
  g.fillStyle(t.base, 1); g.fillRect(x, y, w, h);
  g.fillStyle(t.dark, 0.6);
  if (horiz) for (let r = y + 9; r < y + h; r += 13) g.fillRect(x, r, w, 2);
  else for (let r = x + 9; r < x + w; r += 13) g.fillRect(r, y, 2, h);
  for (let gy = y + 3; gy < y + h - 4; gy += 10)
    for (let gx = x + 3; gx < x + w - 4; gx += 10) {
      g.fillStyle(CROWD[(Math.random() * CROWD.length) | 0], 1);
      g.fillRect(gx + ((Math.random() * 3) | 0), gy + ((Math.random() * 3) | 0), 5, 5);
    }
}

function fenceBand(g: Phaser.GameObjects.Graphics, t: ThemeCfg, x: number, y: number, w: number, h: number, _horiz: boolean) {
  // concrete wall
  g.fillStyle(t.surround, 1); g.fillRect(x, y, w, h);
  g.fillStyle(t.dark, 0.5);
  for (let i = 0; i < 6; i++) g.fillRect(x + Math.random() * w, y + Math.random() * h, 18, 10); // grime
  // graffiti blobs
  for (let i = 0; i < Math.max(2, (w * h) / 9000); i++) {
    g.fillStyle(GRAFFITI[(Math.random() * GRAFFITI.length) | 0], 0.8);
    g.fillRoundedRect(x + Math.random() * (w - 26), y + Math.random() * (h - 14), 18 + Math.random() * 16, 9 + Math.random() * 7, 3);
  }
  // chain-link fence cross-hatch
  g.lineStyle(1, 0xc8ccd6, 0.28);
  for (let d = -h; d < w; d += 11) { g.beginPath(); g.moveTo(x + d, y); g.lineTo(x + d + h, y + h); g.strokePath(); }
  for (let d = 0; d < w + h; d += 11) { g.beginPath(); g.moveTo(x + d, y); g.lineTo(x + d - h, y + h); g.strokePath(); }
}

function neonBand(g: Phaser.GameObjects.Graphics, t: ThemeCfg, x: number, y: number, w: number, h: number, horiz: boolean) {
  g.fillStyle(t.dark, 1); g.fillRect(x, y, w, h);
  // neon strip lights running parallel to the pitch
  const cols = [0x36e8ff, 0xff4fd8];
  if (horiz) {
    let i = 0;
    for (let r = y + 16; r < y + h - 6; r += 22, i++) {
      g.fillStyle(cols[i % 2], 0.16); g.fillRect(x, r - 2, w, 6);
      g.fillStyle(cols[i % 2], 0.9); g.fillRect(x, r, w, 2);
    }
  } else {
    let i = 0;
    for (let r = x + 16; r < x + w - 6; r += 22, i++) {
      g.fillStyle(cols[i % 2], 0.16); g.fillRect(r - 2, y, 6, h);
      g.fillStyle(cols[i % 2], 0.9); g.fillRect(r, y, 2, h);
    }
  }
}

// ---------- playing surface + markings ----------
export function drawPitch(scene: Phaser.Scene, theme: PitchTheme = "stadium") {
  const t = THEMES[theme];
  const g = scene.add.graphics();
  const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
  const innerW = W - M * 2, innerH = H - M * 2;
  const GB = 20;

  g.fillStyle(t.surround, 1);
  g.fillRect(M - GB, M - GB, innerW + GB * 2, innerH + GB * 2);

  if (theme === "stadium") {
    const stripes = 12, sw = innerW / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle(i % 2 ? t.surfB : t.surfA, 1);
      g.fillRect(M + i * sw, M, sw, innerH);
    }
  } else if (theme === "street") {
    g.fillStyle(t.surfA, 1); g.fillRect(M, M, innerW, innerH);
    g.fillStyle(t.surfB, 0.5);
    for (let i = 0; i < 26; i++) g.fillRect(M + Math.random() * innerW, M + Math.random() * innerH, 40 + Math.random() * 70, 18 + Math.random() * 24); // patchy wear
    g.lineStyle(2, t.dark, 0.55); // cracks
    for (let i = 0; i < 7; i++) {
      let cx = M + Math.random() * innerW, cy = M + Math.random() * innerH;
      g.beginPath(); g.moveTo(cx, cy);
      for (let s = 0; s < 4; s++) { cx += (Math.random() - 0.5) * 120; cy += (Math.random() - 0.5) * 90; g.lineTo(cx, cy); }
      g.strokePath();
    }
  } else {
    g.fillStyle(t.surfA, 1); g.fillRect(M, M, innerW, innerH);
    g.lineStyle(1, t.line, 0.1); // digital grid
    for (let gx = M; gx <= W - M; gx += 48) { g.beginPath(); g.moveTo(gx, M); g.lineTo(gx, H - M); g.strokePath(); }
    for (let gy = M; gy <= H - M; gy += 48) { g.beginPath(); g.moveTo(M, gy); g.lineTo(W - M, gy); g.strokePath(); }
  }

  if (theme === "neon") strokeMarkings(g, t.line, 8, 0.18); // glow underlay
  strokeMarkings(g, t.line, 3, 0.95);

  drawGoal(scene, M - FIELD.GOAL_WIDTH, true, theme);
  drawGoal(scene, W - M, false, theme);
}

function strokeMarkings(g: Phaser.GameObjects.Graphics, color: number, width: number, alpha: number) {
  const M = FIELD.MARGIN, W = FIELD.WIDTH, H = FIELD.HEIGHT;
  const innerW = W - M * 2, innerH = H - M * 2;
  g.lineStyle(width, color, alpha);
  g.strokeRect(M, M, innerW, innerH);
  g.beginPath(); g.moveTo(W / 2, M); g.lineTo(W / 2, H - M); g.strokePath();
  g.strokeCircle(W / 2, H / 2, 64);
  if (width <= 3) { g.fillStyle(color, alpha); g.fillCircle(W / 2, H / 2, 3); }

  const penW = 130, penH = 320, gaW = 54, gaH = 180, spot = 90;
  const penY = H / 2 - penH / 2, gaY = H / 2 - gaH / 2;
  g.strokeRect(M, penY, penW, penH);
  g.strokeRect(M, gaY, gaW, gaH);
  g.strokeRect(W - M - penW, penY, penW, penH);
  g.strokeRect(W - M - gaW, gaY, gaW, gaH);
  if (width <= 3) {
    g.fillStyle(color, alpha); g.fillCircle(M + spot, H / 2, 3); g.fillCircle(W - M - spot, H / 2, 3);
    arc(g, M + spot, H / 2, 52, -55, 55);
    arc(g, W - M - spot, H / 2, 52, 125, 235);
    cornerArc(g, M, M, 0, 90); cornerArc(g, W - M, M, 90, 180);
    cornerArc(g, M, H - M, 270, 360); cornerArc(g, W - M, H - M, 180, 270);
  }
}

function drawGoal(scene: Phaser.Scene, x: number, left: boolean, theme: PitchTheme) {
  const gy = FIELD.HEIGHT / 2 - FIELD.GOAL_HEIGHT / 2;
  const gw = FIELD.GOAL_WIDTH, gh = FIELD.GOAL_HEIGHT;
  const net = scene.add.graphics();
  const post = theme === "neon" ? 0x36e8ff : 0xffffff;
  net.fillStyle(post, theme === "neon" ? 0.06 : 0.1);
  net.fillRect(x, gy, gw, gh);
  net.lineStyle(1, post, 0.4);
  for (let i = 0; i <= gw; i += 6) { net.beginPath(); net.moveTo(x + i, gy); net.lineTo(x + i, gy + gh); net.strokePath(); }
  for (let j = 0; j <= gh; j += 6) { net.beginPath(); net.moveTo(x, gy + j); net.lineTo(x + gw, gy + j); net.strokePath(); }
  net.lineStyle(4, post, 1);
  net.strokeRect(x, gy, gw, gh);
  net.lineStyle(5, post, 1);
  const lx = left ? x + gw : x;
  net.beginPath(); net.moveTo(lx, gy); net.lineTo(lx, gy + gh); net.strokePath();
}

// ---------- perimeter ad boards (all themes) ----------
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
