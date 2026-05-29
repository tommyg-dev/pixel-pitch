import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import type { BaseMessageSignerWalletAdapter } from "@solana/wallet-adapter-base";
import { Keypair } from "@solana/web3.js";

export type WalletKind = "phantom" | "solflare";

let adapter: BaseMessageSignerWalletAdapter | null = null;
let mockWallet: string | null = null;

export function getAdapter(): BaseMessageSignerWalletAdapter | null {
  return adapter;
}

export function publicKey(): string | null {
  return adapter?.publicKey?.toBase58() ?? mockWallet;
}

/**
 * TEST ONLY: skip the wallet extension and use a freshly generated address.
 * Each tab gets a unique wallet so you can fill a 3v3 lobby locally.
 * Only usable while the server's token gate is disabled.
 */
export function useTestWallet(): string {
  mockWallet = Keypair.generate().publicKey.toBase58();
  adapter = null;
  return mockWallet;
}

/**
 * Connect a browser wallet. Tries Phantom, then Solflare. Both adapters are
 * framework-agnostic, so they work fine inside a plain Phaser/Vite app.
 */
export async function connectWallet(prefer?: WalletKind): Promise<string> {
  const phantom = new PhantomWalletAdapter();
  const solflare = new SolflareWalletAdapter();

  const order =
    prefer === "solflare" ? [solflare, phantom] : [phantom, solflare];

  for (const a of order) {
    // readyState "Installed" or "Loadable" means we can attempt a connect.
    if (a.readyState === "Installed" || a.readyState === "Loadable") {
      await a.connect();
      adapter = a as BaseMessageSignerWalletAdapter;
      return a.publicKey!.toBase58();
    }
  }
  throw new Error("No Phantom or Solflare wallet detected. Install one to play.");
}

export async function disconnectWallet() {
  await adapter?.disconnect();
  adapter = null;
}

/** Proves wallet ownership by signing a server-issued nonce (used to harden the gate). */
export async function signOwnership(nonce: string): Promise<Uint8Array> {
  if (!adapter) throw new Error("wallet not connected");
  const message = new TextEncoder().encode(`pixel-pitch:${nonce}`);
  return adapter.signMessage(message);
}
