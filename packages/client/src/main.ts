import "./styles/app.css";
import Phaser from "phaser";
import { FIELD, type MatchEndMessage, type ChatMessage } from "@pixel-pitch/shared";
import { MatchScene } from "./scenes/MatchScene";
import type { PitchTheme } from "./scenes/field";
import { connectWallet, publicKey } from "./web3/wallet";
import { joinMatch, fetchEligibility, fetchConfig, fetchLeaderboard, type GameMode, type GameFormat } from "./net/client";
import { initAudio, startMusic, toggleMusic } from "./sound";

const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const modeCards = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-card"));
const pickOverlay = document.getElementById("pickOverlay") as HTMLDivElement;
const lobbyPick = document.getElementById("lobbyPick") as HTMLElement;
const gameArea = document.getElementById("gameArea") as HTMLDivElement;
const exitBtn = document.getElementById("exitBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;
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

const chatForm = document.getElementById("chatForm") as HTMLFormElement;
const chatInput = document.getElementById("chatInput") as HTMLInputElement;
const chatSend = document.getElementById("chatSend") as HTMLButtonElement;
const chatLog = document.getElementById("chatLog") as HTMLDivElement;

let lastMode: GameMode = "pvp";
let lastFormat: GameFormat = "3v3";
let currentRoom: any = null;

musicBtn.addEventListener("click", () => {
  const on = toggleMusic();
  musicBtn.textContent = on ? "♪ MUSIC: ON" : "♪ MUSIC: OFF";
});

let game: Phaser.Game | null = null;

function setStatus(msg: string) { statusEl.textContent = msg; }
function shorten(w: string) { return `${w.slice(0, 4)}…${w.slice(-4)}`; }
function setPickEnabled(on: boolean) {
  modeCards.forEach((b) => (b.disabled = !on));
}
function unlockPicker() {
  pickOverlay.style.display = "none";
  setPickEnabled(true);
  connectBtn.disabled = true;
}

// ----- Chat -----
function setChatEnabled(on: boolean) {
  chatInput.disabled = !on;
  chatSend.disabled = !on;
  chatInput.placeholder = on ? "Type a message… (Enter to send)" : "Join a match to chat…";
}
function appendChat(node: HTMLElement) {
  chatLog.appendChild(node);
  while (chatLog.childElementCount > 60) chatLog.removeChild(chatLog.firstChild!);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function addChatMessage(m: ChatMessage) {
  const row = document.createElement("div");
  row.className = "chat__msg";
  const who = document.createElement("span");
  who.className = `who ${m.team}`;
  who.textContent = `${m.name}:`;
  const txt = document.createElement("span");
  txt.textContent = m.text; // textContent escapes HTML — safe
  row.append(who, txt);
  appendChat(row);
}
function addChatSys(text: string) {
  const row = document.createElement("div");
  row.className = "chat__sys";
  row.textContent = text;
  appendChat(row);
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentRoom) return;
  currentRoom.send("chat", { text });
  chatInput.value = "";
});

// Don't let typing drive the game: pause Phaser's keyboard while the box is focused.
chatInput.addEventListener("focus", () => { if (game?.input.keyboard) game.input.keyboard.enabled = false; });
chatInput.addEventListener("blur", () => { if (game?.input.keyboard) game.input.keyboard.enabled = true; });

connectBtn.addEventListener("click", async () => {
  try {
    setStatus("Connecting wallet…");
    const wallet = await connectWallet();
    walletPill.style.display = "inline-block";
    walletPill.textContent = shorten(wallet);
    connectBtn.textContent = "Connected";

    const cfg = await fetchConfig();
    if (cfg.gateEnabled) {
      setStatus("Checking token balance…");
      const elig = await fetchEligibility(wallet);
      if (!elig.ok) {
        setStatus(`Need ${elig.required} tokens to play. You hold ${elig.balance}.`);
        return; // keep the overlay up — not eligible
      }
    }
    unlockPicker();
    setStatus("Choose your match!");
  } catch (e: any) {
    setStatus(e?.message ?? "Wallet connection failed.");
  }
});

modeCards.forEach((b) =>
  b.addEventListener("click", () => {
    const format = (b.dataset.format as GameFormat) ?? "3v3";
    const mode = (b.dataset.mode as GameMode) ?? "pvp";
    startMatch(format, mode);
  })
);

function exitGame() {
  if (currentRoom) { try { currentRoom.leave(); } catch { /* ignore */ } currentRoom = null; }
  if (game) { game.destroy(true); game = null; }
  gameOverModal.style.display = "none";
  gameArea.style.display = "none";
  lobbyPick.style.display = "";
  setChatEnabled(false);
  setPickEnabled(true);
  setStatus("Choose your match!");
}
exitBtn.addEventListener("click", exitGame);

async function startMatch(format: GameFormat, mode: GameMode) {
  const wallet = publicKey();
  if (!wallet) return;
  lastFormat = format;
  lastMode = mode;
  initAudio(); // unlock Web Audio on this user gesture
  startMusic();
  musicBtn.textContent = "♪ MUSIC: ON";
  gameOverModal.style.display = "none";
  setPickEnabled(false);
  const need = format === "1v1" ? 2 : 6;
  setStatus(mode === "bots" ? `Starting ${format} vs CPU…` : `Joining ${format} lobby…`);
  try {
    if (currentRoom) { try { await currentRoom.leave(); } catch { /* ignore */ } }
    const room = await joinMatch({ wallet }, mode, format);
    currentRoom = room;
    lobbyPick.style.display = "none"; // hide the picker while in a match
    gameArea.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStatus(mode === "bots" ? `${format} vs CPU — kicking off!` : `In lobby — waiting for ${need} players (${format}).`);
    startGame(room, themeFor(format, mode));
    chatLog.innerHTML = "";
    addChatSys(mode === "bots" ? "Practice match vs CPU — say hi!" : "Connected. Chat with your lobby while you wait.");
    setChatEnabled(true);
    room.onMessage("chat", (m: ChatMessage) => addChatMessage(m));
    room.onMessage("matchEnd", (msg: MatchEndMessage) => showGameOver(msg, wallet));
    room.onLeave(() => { setChatEnabled(false); addChatSys("Disconnected from match."); setPickEnabled(true); refreshLeaderboard(); });
  } catch (e: any) {
    setStatus(e?.message ?? "Could not join a match.");
    setPickEnabled(true);
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
  startMatch(lastFormat, lastMode);
});
homeBtn.addEventListener("click", () => { window.location.href = "/index.html"; });

function themeFor(format: GameFormat, mode: GameMode): PitchTheme {
  if (mode === "bots") return "neon";       // AI bots -> futuristic
  if (format === "1v1") return "street";    // 1v1 duel -> concrete cage
  return "stadium";                          // 3v3 classic -> green stadium
}

function startGame(room: any, theme: PitchTheme) {
  if (game) game.destroy(true);
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: FIELD.WIDTH,
    height: FIELD.HEIGHT,
    parent: gameWrap,
    pixelArt: true,
    backgroundColor: "#0a0820",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Register without auto-start, then start with the room so init() always has data.
    scene: [],
  });
  game.scene.add("match", MatchScene, true, { room, theme });
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
