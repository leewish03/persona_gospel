/**
 * Upload managed prompts to Langfuse (shared by CLI + admin API).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MANAGED_PROMPTS, promptFilePath } from "./managed-prompts.js";

function langfuseHost() {
  return process.env.LANGFUSE_HOST || process.env.LANGFUSE_BASE_URL || "";
}

export function assertLangfuseSeedEnv() {
  const missing = [];
  if (!process.env.LANGFUSE_PUBLIC_KEY) missing.push("LANGFUSE_PUBLIC_KEY");
  if (!process.env.LANGFUSE_SECRET_KEY) missing.push("LANGFUSE_SECRET_KEY");
  if (!langfuseHost()) missing.push("LANGFUSE_HOST or LANGFUSE_BASE_URL");
  if (missing.length) {
    throw new Error(`Missing Langfuse env: ${missing.join(", ")}`);
  }
}

/**
 * @param {{ rootDir: string, labels?: string[], dryRun?: boolean }} options
 */
export async function runLangfuseSeed({ rootDir, labels = ["production", "staging"], dryRun = false }) {
  if (!dryRun) assertLangfuseSeedEnv();

  const langfuse = dryRun ? null : new (await import("@langfuse/client")).LangfuseClient();
  const personas = JSON.parse(await readFile(join(rootDir, "data/personas.json"), "utf8"));
  const created = [];

  for (const item of MANAGED_PROMPTS) {
    const prompt = await readFile(promptFilePath(rootDir, item.segments), "utf8");
    for (const label of labels) {
      if (dryRun) {
        created.push({ name: item.name, label, chars: prompt.length, dryRun: true });
        continue;
      }
      await langfuse.prompt.create({
        name: item.name,
        type: "text",
        prompt,
        labels: [label]
      });
      created.push({ name: item.name, label, chars: prompt.length });
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
    const prompt = [
      `# ${persona.name} (${persona.id})`,
      "",
      "Langfuse 필터·실험용 메타. 대화 데이터는 data/personas.json.",
      "",
      "```json",
      JSON.stringify(config, null, 2),
      "```"
    ].join("\n");
    for (const label of labels) {
      if (dryRun) {
        created.push({ name, label, dryRun: true });
        continue;
      }
      await langfuse.prompt.create({
        name,
        type: "text",
        prompt,
        labels: [label],
        config
      });
      created.push({ name, label });
    }
  }

  return { labels, dryRun, created, count: created.length };
}
