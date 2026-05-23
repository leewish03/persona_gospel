#!/usr/bin/env node
/**
 * Upload Persona Gospel prompts to Langfuse (5·6·7번 포함).
 * Loads workspace `.env` if present (keys not committed to git).
 *
 *   npm run langfuse:seed
 *   npm run langfuse:seed -- --dry-run
 *   npm run langfuse:seed -- --label=staging
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runLangfuseSeed } from "../lib/langfuse-seed-runner.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const labelArg = process.argv.find((a) => a.startsWith("--label="));
const labels = labelArg ? [labelArg.split("=")[1]] : ["production", "staging"];

async function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = await readFile(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  await loadEnvFile(join(rootDir, ".env"));
  await loadEnvFile(join(rootDir, ".env.local"));

  const result = await runLangfuseSeed({ rootDir, labels, dryRun });
  console.log(
    dryRun
      ? `Dry run: ${result.count} prompt versions would be created (${labels.join(", ")}).`
      : `Langfuse seed complete: ${result.count} versions. Labels: ${labels.join(", ")}.`
  );
  for (const row of result.created) {
    if (row.dryRun) console.log(`  [dry-run] ${row.name} (${row.label})`);
    else console.log(`  created ${row.name} (${row.label})`);
  }
}

main()
  .then(async () => {
    const { flushLangfuse, shutdownLangfuse } = await import("../lib/langfuse-tracing.js");
    await flushLangfuse();
    await shutdownLangfuse();
  })
  .catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
