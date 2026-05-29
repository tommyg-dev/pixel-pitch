import "./styles/app.css";
import { fetchLeaderboard, fetchConfig } from "./net/client";

const lbBody = document.getElementById("lbBody") as HTMLTableSectionElement;
const contract = document.getElementById("contract") as HTMLElement | null;

function shorten(w: string) { return `${w.slice(0, 4)}…${w.slice(-4)}`; }

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

async function loadConfig() {
  if (!contract) return;
  try {
    const cfg = await fetchConfig();
    contract.textContent = cfg.mint || "set TOKEN_MINT to display";
  } catch { /* server offline — leave placeholder */ }
}

loadLeaderboard();
loadConfig();
setInterval(loadLeaderboard, 30_000);
