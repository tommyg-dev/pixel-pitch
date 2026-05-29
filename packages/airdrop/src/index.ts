import process from "node:process";
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
} from "@solana/spl-token";

try { process.loadEnvFile(new URL("../.env", import.meta.url)); } catch { /* optional */ }

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const MINT = process.env.TOKEN_MINT ?? "";
const PAYER_PATH = process.env.PAYER_KEYPAIR ?? "./keypair.json";
const SERVER = process.env.SERVER_HTTP ?? "http://localhost:2567";
const WINDOW_MIN = Number(process.env.WINDOW_MINUTES ?? "20");
const POOL_PCT = Number(process.env.AIRDROP_PCT ?? "10"); // % of treasury per cycle
const TOP_N = Number(process.env.TOP_N ?? "5");

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
  const decimals = (await getMint(connection, mint)).decimals;
  const payer = loadPayer(PAYER_PATH);

  // 1) treasury balance -> pool = POOL_PCT% of it
  const balanceUi = await treasuryBalance(connection, mint, payer.publicKey, decimals);
  const poolUi = (balanceUi * POOL_PCT) / 100;

  // 2) top N players this cycle
  const standings = await fetchStandings();
  const winners = standings.slice(0, TOP_N);

  console.log(`\nAirdrop — ${MINT} on ${RPC}`);
  console.log(`Treasury balance: ${fmt(balanceUi)}  ->  pool (${POOL_PCT}%): ${fmt(poolUi)}`);
  console.log(`Window: last ${WINDOW_MIN} min   Top ${TOP_N} players split equally\n`);

  if (winners.length === 0) return console.log("No eligible players this cycle. Skipping.");
  if (poolUi <= 0) return console.log("Treasury pool is empty. Skipping.");

  const shareUi = poolUi / winners.length; // equal split among the present top players
  winners.forEach((w, i) =>
    console.log(`  #${i + 1}  ${w.wallet}  (W:${w.wins} G:${w.goals})  ->  ${fmt(shareUi)} $KFi`)
  );
  console.log(`\n  TOTAL: ${fmt(shareUi * winners.length)} to ${winners.length} wallet(s)`);

  if (!EXECUTE) return console.log("\n[dry-run] Re-run with --execute (one-shot) or --loop (auto every cycle).");

  const fromAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  const rawShare = BigInt(Math.floor(shareUi * 10 ** decimals));
  if (rawShare <= 0n) return console.log("Share rounds to zero. Skipping.");

  for (const w of winners) {
    try {
      const owner = new PublicKey(w.wallet);
      const toAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner);
      const tx = new Transaction().add(
        createTransferCheckedInstruction(fromAta.address, mint, toAta.address, payer.publicKey, rawShare, decimals)
      );
      const sig = await connection.sendTransaction(tx, [payer]);
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  ✓ ${w.wallet}  ${fmt(shareUi)} $KFi  (${sig})`);
    } catch (err) {
      console.error(`  ✗ ${w.wallet} FAILED:`, (err as Error).message);
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

async function treasuryBalance(connection: Connection, mint: PublicKey, owner: PublicKey, decimals: number): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const acc = await getAccount(connection, ata);
    return Number(acc.amount) / 10 ** decimals;
  } catch { return 0; }
}

async function fetchStandings(): Promise<Standing[]> {
  const r = await fetch(`${SERVER}/airdrop/standings?minutes=${WINDOW_MIN}&limit=${TOP_N}`);
  if (!r.ok) throw new Error(`server returned ${r.status}`);
  return (await r.json()) as Standing[];
}

function loadPayer(path: string): Keypair {
  const bytes = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

main().catch((e) => {
  console.error("airdrop error:", e.message ?? e);
  process.exit(1);
});
