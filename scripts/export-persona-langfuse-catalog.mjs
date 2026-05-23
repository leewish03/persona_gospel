#!/usr/bin/env node
/** Writes data/langfuse-persona-catalog.json for Langfuse datasets / experiments. */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const personas = JSON.parse(await readFile(join(rootDir, "data/personas.json"), "utf8"));

const catalog = personas.map((persona) => {
  const rt = persona.roleplayTemplate || {};
  return {
    personaId: persona.id,
    name: persona.name,
    title: persona.title,
    shortDescription: persona.shortDescription,
    coreStack: rt.coreStack,
    gospelBarriers: persona.gospelBarriers,
    lateSessionTension: rt.lateSessionTension,
    sessionArc: rt.sessionArc,
    pasMap: (rt.pasMap || []).map((p) => ({
      id: p.id,
      userMove: p.userMove,
      trigger: p.trigger,
      purpose: p.purpose
    })),
    badResponsePatterns: rt.badResponsePatterns,
    langfuseTags: [`persona:${persona.id}`],
    langfusePromptConfigName: `persona/${persona.id}/runtime-config`
  };
});

const outPath = join(rootDir, "data/langfuse-persona-catalog.json");
await writeFile(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), personas: catalog }, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath} (${catalog.length} personas)`);
