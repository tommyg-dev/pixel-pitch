import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const MINT = process.env.TOKEN_MINT ?? "";
const MIN_HOLD = Number(process.env.TOKEN_MIN_HOLD ?? "500000");

const connection = new Connection(RPC_URL, "confirmed");

/**
 * Returns the wallet's UI balance of the gated mint, summed across token accounts.
 * If no mint is configured, gating is disabled and everyone passes (returns Infinity).
 */
export async function getTokenBalance(walletBase58: string): Promise<number> {
  if (!MINT) return Number.POSITIVE_INFINITY;
  const owner = new PublicKey(walletBase58);
  const mintStr = new PublicKey(MINT).toBase58();
  let total = 0;
  // Check both the legacy SPL Token program and Token-2022 (pump.fun $KFi is Token-2022).
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const res = await connection.getParsedTokenAccountsByOwner(owner, { programId });
    for (const { account } of res.value) {
      const info = account.data.parsed?.info;
      if (info?.mint === mintStr) total += info.tokenAmount?.uiAmount ?? 0;
    }
  }
  return total;
}

export async function isEligible(walletBase58: string): Promise<{ ok: boolean; balance: number; required: number }> {
  try {
    const balance = await getTokenBalance(walletBase58);
    return { ok: balance >= MIN_HOLD, balance, required: MIN_HOLD };
  } catch (err) {
    console.error("token gate check failed:", err);
    return { ok: false, balance: 0, required: MIN_HOLD };
  }
}

export const gateConfig = { mint: MINT, minHold: MIN_HOLD, rpc: RPC_URL, enabled: Boolean(MINT) };
