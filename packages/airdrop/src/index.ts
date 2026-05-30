import process from "node:process";
import { readFileSync, existsSync } from "node:fs";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import type { PublicKey as PK } from "@solana/web3.js";

async function detectTokenProgram(connection: Connection, mint: PublicKey): Promise<PK> {
  const info = await connection.getAccountInfo(mint);
  if (info?.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

try { process.loadEnvFile(new URL("../.env", import.meta.url)); } catch { /* optional */ }

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const MINT = process.env.TOKEN_MINT ?? "";
const PAYER_PATH = process.env.PAYER_KEYPAIR ?? "./keypair.json";
const SERVER = process.env.SERVER_HTTP ?? "http://localhost:2567";
const WINDOW_MIN = Number(process.env.WINDOW_MINUTES ?? "20");
const POOL_PCT = Number(process.env.AIRDROP_PCT ?? "10"); // % of treasury per cycle
const TOP_N = Number(process.env.TOP_N ?? "5");
// Pool share per rank (1st, 2nd, then 3rd/4th/5th split the remainder).
const WEIGHTS = (process.env.RANK_WEIGHTS ?? "40,25,11.67,11.67,11.66")
  .split(",").map(Number).filter((n) => !Number.isNaN(n));

const EXECUTE = process.argv.includes("--execute") || process.argv.includes("--loop");
const LOOP = process.argv.includes("--loop");

interface Standing { wallet: string; wins: number; goals: number }

async function main() {
  if (!MINT) throw new Error("TOKEN_MINT not set");
  if (LOOP) return runLoop();
  await runOnce();
}

async function runOnce() {
  const connection = new Connection(RPC, "confirmed");
  const mint = new PublicKey(MINT);
  const tokenProgram = await detectTokenProgram(connection, mint); // legacy SPL or Token-2022
  const decimals = (await getMint(connection, mint, undefined, tokenProgram)).decimals;
  const payer = loadPayer(PAYER_PATH);

  // Safety: if a treasury address is configured, refuse to run with a mismatched key.
  const expected = process.env.TREASURY_ADDRESS?.trim();
  if (expected && payer.publicKey.toBase58() !== expected) {
    throw new Error(
      `Wrong key: loaded ${payer.publicKey.toBase58()} but TREASURY_ADDRESS is ${expected}.`
    );
  }

  // 1) treasury balance -> pool = POOL_PCT% of it
  const balanceUi = await treasuryBalance(connection, mint, payer.publicKey, decimals, tokenProgram);
  const poolUi = (balanceUi * POOL_PCT) / 100;

  // 2) top N players this cycle
  const standings = await fetchStandings();
  const winners = standings.slice(0, TOP_N);

  console.log(`\nAirdrop — ${MINT} on ${RPC}`);
  console.log(`Treasury balance: ${fmt(balanceUi)}  ->  pool (${POOL_PCT}%): ${fmt(poolUi)}`);
  console.log(`Window: last ${WINDOW_MIN} min   Top ${TOP_N} players, ranked split\n`);

  if (winners.length === 0) return console.log("No eligible players this cycle. Skipping.");
  if (poolUi <= 0) return console.log("Treasury pool is empty. Skipping.");

  // Ranked split: take as many weights as there are winners, normalise so the
  // full pool is distributed (1st gets the most, then 2nd, the rest split evenly).
  const w = WEIGHTS.slice(0, winners.length);
  const wsum = w.reduce((a, b) => a + b, 0) || 1;
  const sharesUi = winners.map((_, i) => (poolUi * (w[i] ?? 0)) / wsum);

  winners.forEach((p, i) =>
    console.log(`  #${i + 1}  ${p.wallet}  (W:${p.wins} G:${p.goals})  ->  ${fmt(sharesUi[i])} $KFi`)
  );
  console.log(`\n  TOTAL: ${fmt(sharesUi.reduce((a, b) => a + b, 0))} to ${winners.length} wallet(s)`);

  if (!EXECUTE) return console.log("\n[dry-run] Re-run with --execute (one-shot) or --loop (auto every cycle).");

  const fromAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey, false, undefined, undefined, tokenProgram);
  for (let i = 0; i < winners.length; i++) {
    const raw = BigInt(Math.floor(sharesUi[i] * 10 ** decimals));
    if (raw <= 0n) continue;
    try {
      const owner = new PublicKey(winners[i].wallet);
      const toAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner, false, undefined, undefined, tokenProgram);
      const tx = new Transaction().add(
        createTransferCheckedInstruction(fromAta.address, mint, toAta.address, payer.publicKey, raw, decimals, [], tokenProgram)
      );
      const sig = await connection.sendTransaction(tx, [payer]);
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  ✓ #${i + 1} ${winners[i].wallet}  ${fmt(sharesUi[i])} $KFi  (${sig})`);
    } catch (err) {
      console.error(`  ✗ ${winners[i].wallet} FAILED:`, (err as Error).message);
    }
  }
  console.log("Payout complete.");
}

// Runs automatically just after each cycle boundary.
function runLoop() {
  const cycleMs = WINDOW_MIN * 60_000;
  let lastCycle = -1;
  console.log(`Auto-airdrop loop: paying top ${TOP_N} (${POOL_PCT}% of treasury) every ${WINDOW_MIN} min.`);
  const schedule = () => {
    const wait = cycleMs - (Date.now() % cycleMs) + 2000; // fire ~2s after the boundary
    setTimeout(async () => {
      const cycle = Math.floor(Date.now() / cycleMs);
      if (cycle !== lastCycle) {
        lastCycle = cycle;
        console.log(`\n[${new Date().toISOString()}] cycle payout`);
        try { await runOnce(); } catch (e) { console.error("payout error:", (e as Error).message); }
      }
      schedule();
    }, wait);
  };
  schedule();
}

async function treasuryBalance(connection: Connection, mint: PublicKey, owner: PublicKey, decimals: number, tokenProgram: PK): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgram);
    const acc = await getAccount(connection, ata, undefined, tokenProgram);
    return Number(acc.amount) / 10 ** decimals;
  } catch { return 0; }
}

async function fetchStandings(): Promise<Standing[]> {
  const r = await fetch(`${SERVER}/airdrop/standings?minutes=${WINDOW_MIN}&limit=${TOP_N}`);
  if (!r.ok) throw new Error(`server returned ${r.status}`);
  return (await r.json()) as Standing[];
}

function loadPayer(path: string): Keypair {
  // 1) PAYER_SECRET env (base58 private key, e.g. exported from Phantom/Solflare)
  const envSecret = process.env.PAYER_SECRET?.trim();
  if (envSecret) return fromSecretString(envSecret);
  // 2) a file containing either a JSON byte array or a base58 secret
  if (existsSync(path)) return fromSecretString(readFileSync(path, "utf8").trim());
  throw new Error("No treasury key. Set PAYER_SECRET (base58) or PAYER_KEYPAIR file.");
}

function fromSecretString(s: string): Keypair {
  if (s.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s) as number[]));
  return Keypair.fromSecretKey(bs58.decode(s)); // base58 secret key
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

main().catch((e) => {
  console.error("airdrop error:", e.message ?? e);
  process.exit(1);
});
