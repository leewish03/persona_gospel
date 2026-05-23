#!/usr/bin/env node
/**
 * Upload Persona Gospel prompts to Langfuse (5·6·7번 포함).
 * Requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST (or LANGFUSE_BASE_URL).
 *
 *   npm run langfuse:seed
 *   npm run langfuse:seed -- --dry-run
 *   npm run langfuse:seed -- --label staging
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MANAGED_PROMPTS, promptFilePath } from "../lib/managed-prompts.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const labelArg = process.argv.find((a) => a.startsWith("--label="));
const labels = labelArg ? [labelArg.split("=")[1]] : ["production", "staging"];

function requireEnv(name) {
  const value = process.env[name] || (name === "LANGFUSE_HOST" ? process.env.LANGFUSE_BASE_URL : "");
  if (!value) {
    console.error(`Missing ${name}. Set Langfuse API keys before running this script.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  if (!dryRun) {
    requireEnv("LANGFUSE_PUBLIC_KEY");
    requireEnv("LANGFUSE_SECRET_KEY");
    requireEnv("LANGFUSE_HOST");
  }

  const langfuse = dryRun
    ? null
    : new (await import("@langfuse/client")).LangfuseClient();
  const personas = JSON.parse(await readFile(join(rootDir, "data/personas.json"), "utf8"));

  for (const item of MANAGED_PROMPTS) {
    const prompt = await readFile(promptFilePath(rootDir, item.segments), "utf8");
    for (const label of labels) {
      if (dryRun) {
        console.log(`[dry-run] would create ${item.name} label=${label} (${prompt.length} chars)`);
        continue;
      }
      await langfuse.prompt.create({
        name: item.name,
        type: "text",
        prompt,
        labels: [label]
      });
      console.log(`created ${item.name} (${label})`);
    }
  }

  for (const persona of personas) {
    const rt = persona.roleplayTemplate || {};
    const config = {
      personaId: persona.id,
      personaName: persona.name,
      title: persona.title,
      coreStack: rt.coreStack,
      gospelBarriers: persona.gospelBarriers,
      lateSessionTension: rt.lateSessionTension,
      pasMapCount: (rt.pasMap || []).length,
      userMoves: [...new Set((rt.pasMap || []).map((p) => p.userMove))]
    };
    const name = `persona/${persona.id}/runtime-config`;
    for (const label of labels) {
      if (dryRun) {
        console.log(`[dry-run] would create ${name} label=${label}`);
        continue;
      }
      await langfuse.prompt.create({
        name,
        type: "text",
        prompt: [
          `# ${persona.name} (${persona.id})`,
          "",
          "Langfuse 필터·실험용 메타. 대화 데이터는 data/personas.json.",
          "",
          "```json",
          JSON.stringify(config, null, 2),
          "```"
        ].join("\n"),
        labels: [label],
        config
      });
      console.log(`created ${name} (${label})`);
    }
  }

  console.log(
    dryRun
      ? "Dry run complete."
      : `Langfuse seed complete. Labels: ${labels.join(", ")}. Set LANGFUSE_PROMPT_LABEL=staging to experiment in Render.`
  );
}

main()
  .then(async () => {
    const { flushLangfuse, shutdownLangfuse } = await import("../lib/langfuse-tracing.js");
    await flushLangfuse();
    await shutdownLangfuse();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
