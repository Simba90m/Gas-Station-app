#!/usr/bin/env node
// One-time setup for a freshly created (unseeded) Supabase project: promotes
// the account you sign in with here to OWNER — but only if no OWNER/MANAGER
// exists yet in that project. See
// supabase/migrations/20240101000160_bootstrap_first_owner.sql for why this
// is needed and why it's safe to run any time (it refuses once an admin
// already exists).
//
// Usage: pnpm db:bootstrap-owner
//
// It reads the Supabase URL + publishable key from apps/admin/.env(.local),
// prompts for the email/password of an account you already created (e.g.
// via the admin login page, after Supabase rejected it for lacking admin
// access), and calls the bootstrap_first_owner() database function as that
// account. No email, password, or UUID is hardcoded — nothing is written to
// disk or logged.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_DIR = join(__dirname, "..", "apps", "admin");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

// .env.local overrides .env, same precedence Next.js itself uses.
const env = {
  ...loadEnvFile(join(ADMIN_DIR, ".env")),
  ...loadEnvFile(join(ADMIN_DIR, ".env.local")),
};

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/admin/.env or apps/admin/.env.local.",
  );
  process.exit(1);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Reads a line without echoing it back to the terminal. Falls back to a
// plain (visible) prompt when stdin isn't an interactive TTY.
function askHidden(question) {
  if (!process.stdin.isTTY) return ask(question);

  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.resume();
    stdin.setRawMode(true);
    let input = "";

    const onData = (chunk) => {
      const char = chunk.toString("utf8");
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
        return;
      }
      if (char === "\u0003") process.exit(1); // Ctrl+C
      if (char === "\u007f") {
        input = input.slice(0, -1); // backspace
        return;
      }
      input += char;
    };
    stdin.on("data", onData);
  });
}

async function main() {
  console.log(`Target project: ${SUPABASE_URL}`);
  const email = await ask("Email: ");
  const password = await askHidden("Password: ");

  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const signInData = await signInRes.json();
  if (!signInRes.ok || !signInData.access_token) {
    console.error(`Sign-in failed: ${signInData.error_description ?? signInData.msg ?? signInRes.statusText}`);
    process.exit(1);
  }

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bootstrap_first_owner`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${signInData.access_token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const rpcData = await rpcRes.json();

  if (!rpcRes.ok) {
    console.error(`bootstrap_first_owner() refused: ${rpcData.message ?? JSON.stringify(rpcData)}`);
    console.error(
      "This is expected once an OWNER/MANAGER already exists — sign in as an existing owner/manager and use the admin dashboard (or set_profile_role()) to promote further users instead.",
    );
    process.exit(1);
  }

  console.log(`Success — ${email} is now ${rpcData}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
