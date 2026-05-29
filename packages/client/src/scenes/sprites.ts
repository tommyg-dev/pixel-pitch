import Phaser from "phaser";

// Procedurally generated pixel-art footballers (no binary assets). Drawn on a
// small grid (1px = 1 cell) and scaled up with nearest-neighbour for crisp pixels.

export const CHAR_SCALE = 3;

const SKINS = ["#ffd9b0", "#f0b079", "#c98b54", "#8a5a32"];
const HAIRS = ["#2a1c10", "#5a3210", "#caa14a", "#b5471f", "#8a8a92"];

type Palette = {
  skin: string; skinSh: string; hair: string; hairHi: string;
  jersey: string; jerseyDark: string; jerseyHi: string;
  shorts: string; shortsSh: string; socks: string; boot: string;
  eye: string; outline: string;
};

const TEAM = {
  blue: { jersey: "#3a64ff", socks: "#2742b5" },
  orange: { jersey: "#ff9526", socks: "#c96a12" },
};

export function variantFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = c(((n >> 16) & 255) * f), g = c(((n >> 8) & 255) * f), b = c((n & 255) * f);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function paletteFor(team: "blue" | "orange", variant: number): Palette {
  const t = TEAM[team];
  const skin = SKINS[variant % SKINS.length];
  const hair = HAIRS[(variant >>> 3) % HAIRS.length]; // unsigned shift — keep index positive
  return {
    skin, skinSh: shade(skin, 0.8),
    hair, hairHi: shade(hair, 1.4),
    jersey: t.jersey, jerseyDark: shade(t.jersey, 0.72), jerseyHi: shade(t.jersey, 1.25),
    shorts: "#eef0f6", shortsSh: "#c7c9d6",
    socks: t.socks, boot: "#2b2b2b",
    eye: "#26242b", outline: "#15101c",
  };
}

// 14 cols wide. Legend:
//  o outline, H hair, h hair-hi, S skin, d skin-shadow, e eye,
//  J jersey, j jersey-shadow, k jersey-hi, P shorts, p shorts-shadow,
//  C socks, B boot, '.' transparent.
const BODY = [
  "...oHHHHHHo...",
  "..oHhhhhhhHo..",
  "..oHHHHHHHHo..",
  "..oHSSSSSSHo..",
  "..oSSSSSSSSo..",
  "..oSeSSSSeSo..",
  "..oSSSddSSSo..",
  "...oSSSSSSo...",
  ".....SSdd.....",
  "..okkJJJJkko..",
  ".oSJJJJJJJJSo.",
  ".oSJJJJJJJJSo.",
  ".oSjJJJJJJjSo.",
  "..jJJJJJJJJj..",
  "..oPPPPPPPPo..",
  "..oPPppPPPPo..",
];

function legRows(phase: 0 | 1 | 2): string[] {
  if (phase === 1) {
    return ["..CCC...CCC...", ".CCC....CCC...", "BBBB....BBBB.."];
  }
  if (phase === 2) {
    return ["...CCC...CCC..", "...CCC....CCC.", "..BBBB....BBBB"];
  }
  return ["...CCC..CCC...", "...CCC..CCC...", "..BBBB..BBBB.."];
}

function colorFor(ch: string, p: Palette): string | null {
  switch (ch) {
    case "H": return p.hair;
    case "h": return p.hairHi;
    case "S": return p.skin;
    case "d": return p.skinSh;
    case "e": return p.eye;
    case "J": return p.jersey;
    case "j": return p.jerseyDark;
    case "k": return p.jerseyHi;
    case "P": return p.shorts;
    case "p": return p.shortsSh;
    case "C": return p.socks;
    case "B": return p.boot;
    case "o": return p.outline;
    default: return null;
  }
}

function drawMatrix(scene: Phaser.Scene, key: string, rows: string[], p: Palette) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colorFor(row[x], p);
      if (!c) continue;
      g.fillStyle(Phaser.Display.Color.HexStringToColor(c).color, 1);
      g.fillRect(x, y, 1, 1);
    }
  });
  g.generateTexture(key, w, h);
  g.destroy();
}

export function ensurePlayerTextures(scene: Phaser.Scene, team: "blue" | "orange", variant: number): string {
  const prefix = `plr_${team}_${variant % (SKINS.length * HAIRS.length)}`;
  const p = paletteFor(team, variant);
  drawMatrix(scene, `${prefix}_0`, [...BODY, ...legRows(0)], p);
  drawMatrix(scene, `${prefix}_1`, [...BODY, ...legRows(1)], p);
  drawMatrix(scene, `${prefix}_2`, [...BODY, ...legRows(2)], p);
  return prefix;
}

/** A clean round ball with pixel pentagon spots. */
export function ensureBallTexture(scene: Phaser.Scene): string {
  const key = "ball_tex";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(12, 12, 12);
  g.lineStyle(2, 0x222222, 1);
  g.strokeCircle(12, 12, 11);
  g.fillStyle(0x222222, 1);
  g.fillCircle(12, 9, 3);
  g.fillCircle(7, 15, 2.4);
  g.fillCircle(17, 15, 2.4);
  g.generateTexture(key, 24, 24);
  g.destroy();
  return key;
}
