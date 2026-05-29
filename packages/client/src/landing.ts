import "./styles/app.css";
import Phaser from "phaser";
import { FIELD } from "@pixel-pitch/shared";
import { HeroScene } from "./scenes/HeroScene";
import { fetchLeaderboard, fetchConfig } from "./net/client";

const lbBody = document.getElementById("lbBody") as HTMLTableSectionElement;
const contract = document.getElementById("contract") as HTMLElement | null;
const caText = document.getElementById("caText") as HTMLElement | null;
const copyCa = document.getElementById("copyCa") as HTMLButtonElement | null;

function shorten(w: string) { return `${w.slice(0, 4)}…${w.slice(-4)}`; }

// ----- animated hero (server-free demo match) -----
new Phaser.Game({
  type: Phaser.AUTO,
  width: FIELD.WIDTH,
  height: FIELD.HEIGHT,
  parent: "heroGame",
  pixelArt: true,
  backgroundColor: "#07071a",
  scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [HeroScene],
});

// ----- copy contract address -----
copyCa?.addEventListener("click", async () => {
  const text = caText?.textContent?.trim() ?? "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyCa.textContent = "COPIED!";
    setTimeout(() => (copyCa.textContent = "COPY"), 1500);
  } catch {
    copyCa.textContent = "COPY FAILED";
    setTimeout(() => (copyCa.textContent = "COPY"), 1500);
  }
});

async function loadConfig() {
  try {
    const cfg = await fetchConfig();
    if (cfg.mint) {
      if (caText) caText.textContent = cfg.mint;
      if (contract) contract.textContent = cfg.mint;
    }
  } catch { /* server offline — keep placeholder */ }
}

async function loadLeaderboard() {
  try {
    const rows = await fetchLeaderboard();
    if (!rows.length) {
      lbBody.innerHTML = `<tr><td colspan="4">No matches played yet — be the first squad on the board.</td></tr>`;
      return;
    }
    lbBody.innerHTML = rows
      .slice(0, 10)
      .map((r, i) => `<tr><td class="rank">${i + 1}</td><td>${shorten(r.wallet)}</td><td>${r.wins}</td><td>${r.goals}</td></tr>`)
      .join("");
  } catch {
    lbBody.innerHTML = `<tr><td colspan="4">Standings unavailable — start the game server.</td></tr>`;
  }
}

loadConfig();
loadLeaderboard();
setInterval(loadLeaderboard, 30_000);
