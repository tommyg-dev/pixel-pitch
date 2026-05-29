import "./styles/app.css";
import Phaser from "phaser";
import { FIELD, type MatchEndMessage } from "@pixel-pitch/shared";
import { MatchScene } from "./scenes/MatchScene";
import { connectWallet, publicKey, useTestWallet } from "./web3/wallet";
import { joinMatch, fetchEligibility, fetchConfig, fetchLeaderboard, type GameMode } from "./net/client";
import { initAudio, startMusic, toggleMusic } from "./sound";

const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const skipBtn = document.getElementById("skipBtn") as HTMLButtonElement;
const pvpBtn = document.getElementById("pvpBtn") as HTMLButtonElement;
const botBtn = document.getElementById("botBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const walletPill = document.getElementById("walletPill") as HTMLSpanElement;
const lbBody = document.getElementById("lbBody") as HTMLTableSectionElement;
const gameWrap = document.getElementById("gameWrap") as HTMLDivElement;
const musicBtn = document.getElementById("musicBtn") as HTMLButtonElement;
const gameOverModal = document.getElementById("gameOverModal") as HTMLDivElement;
const goWinner = document.getElementById("goWinner") as HTMLDivElement;
const goScore = document.getElementById("goScore") as HTMLDivElement;
const goResult = document.getElementById("goResult") as HTMLDivElement;
const playAgainBtn = document.getElementById("playAgainBtn") as HTMLButtonElement;
const homeBtn = document.getElementById("homeBtn") as HTMLButtonElement;

let lastMode: GameMode = "pvp";
let currentRoom: any = null;

musicBtn.addEventListener("click", () => {
  const on = toggleMusic();
  musicBtn.textContent = on ? "♪ MUSIC: ON" : "♪ MUSIC: OFF";
});

let game: Phaser.Game | null = null;

function setStatus(msg: string) { statusEl.textContent = msg; }
function shorten(w: string) { return `${w.slice(0, 4)}…${w.slice(-4)}`; }
function setPlayEnabled(on: boolean) { pvpBtn.disabled = !on; botBtn.disabled = !on; }

connectBtn.addEventListener("click", async () => {
  try {
    setStatus("Connecting wallet…");
    const wallet = await connectWallet();
    walletPill.style.display = "inline-block";
    walletPill.textContent = shorten(wallet);
    connectBtn.textContent = "Connected";
    connectBtn.disabled = true;
    skipBtn.disabled = true;
    setPlayEnabled(true);

    const cfg = await fetchConfig();
    if (cfg.gateEnabled) {
      setStatus("Checking token balance…");
      const elig = await fetchEligibility(wallet);
      if (!elig.ok) {
        setPlayEnabled(false);
        setStatus(`Need ${elig.required} tokens to play. You hold ${elig.balance}.`);
        return;
      }
      setStatus(`Eligible — you hold ${elig.balance} tokens. Choose a mode!`);
    } else {
      setStatus("Gate disabled (dev). Choose a mode!");
    }
  } catch (e: any) {
    setStatus(e?.message ?? "Wallet connection failed.");
  }
});

skipBtn.addEventListener("click", () => {
  const wallet = useTestWallet();
  walletPill.style.display = "inline-block";
  walletPill.textContent = `TEST ${shorten(wallet)}`;
  connectBtn.disabled = true;
  skipBtn.disabled = true;
  setPlayEnabled(true);
  setStatus("Test wallet ready (gate bypassed). Choose a mode!");
});

async function startMatch(mode: GameMode) {
  const wallet = publicKey();
  if (!wallet) return;
  lastMode = mode;
  initAudio(); // unlock Web Audio on this user gesture
  startMusic();
  musicBtn.textContent = "♪ MUSIC: ON";
  gameOverModal.style.display = "none";
  setPlayEnabled(false);
  connectBtn.disabled = true;
  setStatus(mode === "bots" ? "Starting match vs CPU…" : "Joining lobby…");
  try {
    if (currentRoom) { try { await currentRoom.leave(); } catch { /* ignore */ } }
    const room = await joinMatch({ wallet }, mode);
    currentRoom = room;
    setStatus(mode === "bots" ? "Match vs CPU — kicking off!" : "In lobby — waiting for 6 players (3v3).");
    startGame(room);
    room.onMessage("matchEnd", (msg: MatchEndMessage) => showGameOver(msg, wallet));
    room.onLeave(() => refreshLeaderboard());
  } catch (e: any) {
    setStatus(e?.message ?? "Could not join a match.");
    setPlayEnabled(true);
    connectBtn.disabled = false;
  }
}

function showGameOver(msg: MatchEndMessage, wallet: string) {
  const winnerLabel =
    msg.winner === "draw" ? "IT'S A DRAW" : `${msg.winner.toUpperCase()} TEAM WINS`;
  goWinner.textContent = winnerLabel;
  goScore.textContent = `${msg.scoreBlue} - ${msg.scoreOrange}`;

  const myTeam = msg.blueWallets.includes(wallet) ? "blue"
    : msg.orangeWallets.includes(wallet) ? "orange" : null;
  goResult.classList.remove("win", "lose", "draw");
  if (msg.winner === "draw") { goResult.textContent = "DRAW"; goResult.classList.add("draw"); }
  else if (myTeam && msg.winner === myTeam) { goResult.textContent = "🏆 YOU WON!"; goResult.classList.add("win"); }
  else { goResult.textContent = "YOU LOST"; goResult.classList.add("lose"); }

  refreshLeaderboard();
  gameOverModal.style.display = "flex";
}

playAgainBtn.addEventListener("click", () => {
  gameOverModal.style.display = "none";
  startMatch(lastMode);
});
homeBtn.addEventListener("click", () => { window.location.href = "/index.html"; });

pvpBtn.addEventListener("click", () => startMatch("pvp"));
botBtn.addEventListener("click", () => startMatch("bots"));

function startGame(room: any) {
  if (game) game.destroy(true);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: FIELD.WIDTH,
    height: FIELD.HEIGHT,
    parent: gameWrap,
    pixelArt: true,
    backgroundColor: "#1c5c1c",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Register without auto-start, then start with the room so init() always has data.
    scene: [],
  });
  game.scene.add("match", MatchScene, true, { room });
  // Tag the canvas so the preview/verification can find it.
  setTimeout(() => game?.canvas?.setAttribute("id", "game"), 0);
}

async function refreshLeaderboard() {
  try {
    const rows = await fetchLeaderboard();
    if (!rows.length) {
      lbBody.innerHTML = `<tr><td colspan="4" class="hint">No matches played yet.</td></tr>`;
      return;
    }
    lbBody.innerHTML = rows
      .map((r, i) => `<tr><td class="rank">${i + 1}</td><td>${shorten(r.wallet)}</td><td>${r.wins}</td><td>${r.goals}</td></tr>`)
      .join("");
  } catch {
    lbBody.innerHTML = `<tr><td colspan="4" class="hint">Server offline.</td></tr>`;
  }
}

refreshLeaderboard();
setInterval(refreshLeaderboard, 30_000);
