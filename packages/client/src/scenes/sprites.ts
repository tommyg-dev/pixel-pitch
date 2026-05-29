import Phaser from "phaser";

// Procedurally generated pixel-art assets so we ship no binary files.
// Characters are drawn on a tiny grid (1px = 1 cell) and scaled up with
// nearest-neighbour filtering (pixelArt: true) for a crisp retro look.

export const CHAR_SCALE = 3;

const SKINS = ["#ffd1a4", "#f1b27a", "#c98b54", "#8a5a32"];
const HAIRS = ["#1b1b1f", "#4a2c11", "#caa14a", "#b5471f", "#7a7a82"];

type Palette = {
  skin: string; hair: string; jersey: string; jerseyDark: string;
  shorts: string; socks: string; boot: string; eye: string; outline: string;
};

const TEAM = {
  blue: { jersey: "#3a64ff", jerseyDark: "#2742b5", shorts: "#1a2a6b", socks: "#3a64ff" },
  orange: { jersey: "#ff9526", jerseyDark: "#c96a12", shorts: "#7a3d08", socks: "#ff9526" },
};

/** Deterministic variant (skin + hair) from a player id so looks stay stable. */
export function variantFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function paletteFor(team: "blue" | "orange", variant: number): Palette {
  const t = TEAM[team];
  return {
    skin: SKINS[variant % SKINS.length],
    hair: HAIRS[(variant >> 3) % HAIRS.length],
    jersey: t.jersey, jerseyDark: t.jerseyDark, shorts: t.shorts, socks: t.socks,
    boot: "#2a2a2a", eye: "#26242b", outline: "#1a141b",
  };
}

// 12 cols wide. Legend: H hair, S skin, E eye, J jersey, K jersey shade,
// O outline, P shorts, C socks, B boot, '.' transparent.
const BODY = [
  "...OOOOOO...",
  "..OHHHHHHO..",
  "..HHHHHHHH..",
  "..HSSSSSSH..",
  "..SSSSSSSS..",
  "..SESSSESS..",
  "..SSSSSSSS..",
  "...SSSSSS...",
  "..OKJJJJKO..",
  ".OSJJJJJJSO.",
  ".SSJJJJJJSS.",
  ".SSJJJJJJSS.",
  "..KJJJJJJK..",
  "..OKKKKKKO..",
];

function legRows(phase: 0 | 1 | 2): string[] {
  if (phase === 1) {
    return ["..PP....PP..", ".CC.....CC..", "CC.......CC.", "BB.......BB."];
  }
  if (phase === 2) {
    return ["..PP....PP..", ".CC.....CC..", ".CC.....CC..", ".BBB...BBB.."];
  }
  return ["...PP..PP...", "...CC..CC...", "...CC..CC...", "..BBB..BBB.."];
}

function colorFor(ch: string, p: Palette): string | null {
  switch (ch) {
    case "H": return p.hair;
    case "S": return p.skin;
    case "E": return p.eye;
    case "J": return p.jersey;
    case "K": return p.jerseyDark;
    case "P": return p.shorts;
    case "C": return p.socks;
    case "B": return p.boot;
    case "O": return p.outline;
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

/** Builds stand/stride textures for a team+variant. Returns the key prefix. */
export function ensurePlayerTextures(scene: Phaser.Scene, team: "blue" | "orange", variant: number): string {
  const prefix = `plr_${team}_${variant % (SKINS.length * HAIRS.length)}`;
  const p = paletteFor(team, variant);
  drawMatrix(scene, `${prefix}_0`, [...BODY, ...legRows(0)], p);
  drawMatrix(scene, `${prefix}_1`, [...BODY, ...legRows(1)], p);
  drawMatrix(scene, `${prefix}_2`, [...BODY, ...legRows(2)], p);
  return prefix;
}

/** A clean round ball with a couple of pixel spots. */
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
