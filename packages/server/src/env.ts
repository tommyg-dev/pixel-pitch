import process from "node:process";

// Loaded before any module that reads process.env at import time.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* no .env file — fall back to real environment variables */
}

export {};
