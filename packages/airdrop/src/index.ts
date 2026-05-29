import process from "node:process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getMint,
} from "@solana/spl-token";

try { process.loadEnvFile(new URL("../.env", import.meta.url)); } catch { /* optional */ }

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const MINT = process.env.TOKEN_MINT ?? "";
const PAYER_PATH = process.env.PAYER_KEYPAIR ?? "./keypair.json";
const SERVER = process.env.SERVER_HTTP ?? "http://localhost:2567";
const WINDOW_MIN = Number(process.env.WINDOW_MINUTES ?? "20");
const PER_WIN = Number(process.env.TOKENS_PER_WIN ?? "100");

const EXECUTE = process.argv.includes("--execute");

interface Winner { wallet: string; wins: number; }

async function main() {
  if (!MINT) throw new Error("TOKEN_MINT not set");

  const winners = await fetchWinners();
  if (!winners.length) {
    console.log(`No winners in the last ${WINDOW_MIN} min. Nothing to airdrop.`);
    return;
  }

  const connection = new Connection(RPC, "confirmed");
  const mint = new PublicKey(MINT);
  const decimals = (await getMint(connection, mint)).decimals;

  console.log(`\nAirdrop plan — mint ${MINT} on ${RPC}`);
  console.log(`Window: last ${WINDOW_MIN} min  •  ${PER_WIN} tokens per win\n`);
  let total = 0;
  for (const w of winners) {
    const amount = w.wins * PER_WIN;
    total += amount;
    console.log(`  ${w.wallet}   wins=${w.wins}   -> ${amount} tokens`);
  }
  console.log(`\n  TOTAL: ${total} tokens to ${winners.length} wallets`);

  if (!EXECUTE) {
    console.log("\n[dry-run] Re-run with --execute to broadcast. No transactions sent.");
    return;
  }

  // Manual approval gate (per the project's "manual approval for now" policy).
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nBroadcast ${total} tokens to ${winners.length} wallets? type "YES" to confirm: `);
  rl.close();
  if (answer.trim() !== "YES") {
    console.log("Aborted. No transactions sent.");
    return;
  }

  const payer = loadPayer(PAYER_PATH);
  const fromAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);

  for (const w of winners) {
    const amount = w.wins * PER_WIN;
    const raw = BigInt(Math.round(amount * 10 ** decimals));
    try {
      const owner = new PublicKey(w.wallet);
      const toAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner);
      const tx = new Transaction().add(
        createTransferCheckedInstruction(fromAta.address, mint, toAta.address, payer.publicKey, raw, decimals)
      );
      const sig = await connection.sendTransaction(tx, [payer]);
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`  ✓ ${w.wallet}  ${amount} tokens  (${sig})`);
    } catch (err) {
      console.error(`  ✗ ${w.wallet}  FAILED:`, (err as Error).message);
    }
  }
  console.log("\nAirdrop complete.");
}

async function fetchWinners(): Promise<Winner[]> {
  const r = await fetch(`${SERVER}/airdrop/winners?minutes=${WINDOW_MIN}`);
  if (!r.ok) throw new Error(`server returned ${r.status}`);
  return (await r.json()) as Winner[];
}

function loadPayer(path: string): Keypair {
  const bytes = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

main().catch((e) => {
  console.error("airdrop error:", e.message ?? e);
  process.exit(1);
});
