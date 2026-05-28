#!/usr/bin/env node
/**
 * Upload Persona Gospel prompts + per-persona config stubs to Langfuse.
 * Requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST (or LANGFUSE_BASE_URL).
 *
 *   node scripts/langfuse-seed-prompts.mjs
 *   node scripts/langfuse-seed-prompts.mjs --dry-run
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function requireEnv(name) {
  const value = process.env[name] || (name === "LANGFUSE_HOST" ? process.env.LANGFUSE_BASE_URL : "");
  if (!value) {
    console.error(`Missing ${name}. Set Langfuse API keys before running this script.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  requireEnv("LANGFUSE_PUBLIC_KEY");
  requireEnv("LANGFUSE_SECRET_KEY");
  requireEnv("LANGFUSE_HOST");

  const { LangfuseClient } = await import("@langfuse/client");
  const langfuse = new LangfuseClient();

  const personaSystem = await readFile(join(rootDir, "prompts/persona-system-prompt.md"), "utf8");
  const feedbackSystem = await readFile(join(rootDir, "prompts/feedback-prompt.md"), "utf8");
  const personas = JSON.parse(await readFile(join(rootDir, "data/personas.json"), "utf8"));

  const staticPrompts = [
    { name: "roleplay/persona-system", type: "text", prompt: personaSystem },
    { name: "roleplay/feedback-system", type: "text", prompt: feedbackSystem }
  ];

  for (const item of staticPrompts) {
    if (dryRun) {
      console.log(`[dry-run] would create ${item.name} (${item.prompt.length} chars)`);
      continue;
    }
    await langfuse.prompt.create({
      name: item.name,
      type: item.type,
      prompt: item.prompt,
      labels: ["production"]
    });
    console.log(`created ${item.name}`);
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
    if (dryRun) {
      console.log(`[dry-run] would create ${name}`);
      continue;
    }
    await langfuse.prompt.create({
      name,
      type: "text",
      prompt: [
        `# ${persona.name} (${persona.id})`,
        "",
        "이 프롬프트는 Langfuse 실험·필터용 메타데이터입니다.",
        "실제 대화 조립은 server.js + data/personas.json이 담당합니다.",
        "",
        "```json",
        JSON.stringify(config, null, 2),
        "```"
      ].join("\n"),
      labels: ["production"],
      config
    });
    console.log(`created ${name}`);
  }

  console.log(dryRun ? "Dry run complete." : "Langfuse seed complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
