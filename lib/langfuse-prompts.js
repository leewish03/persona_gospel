/**
 * Langfuse Prompt Management with file fallback + {{variable}} compile.
 * Label: LANGFUSE_PROMPT_LABEL (default production). Use staging for experiments.
 */

import { readFile } from "node:fs/promises";
import { MANAGED_PROMPTS, promptFilePath } from "./managed-prompts.js";
import { isLangfuseEnabled } from "./langfuse-tracing.js";

const env = globalThis.process?.env || {};

function promptLabel() {
  return String(env.LANGFUSE_PROMPT_LABEL || "production").trim() || "production";
}

function refreshMs() {
  const ms = Number(env.LANGFUSE_PROMPT_REFRESH_MS || 60_000);
  return Number.isFinite(ms) && ms > 0 ? ms : 60_000;
}

let client = null;
let clientPromise = null;

async function getClient() {
  if (!isLangfuseEnabled()) return null;
  if (client) return client;
  if (!clientPromise) {
    clientPromise = import("@langfuse/client").then(({ LangfuseClient }) => {
      client = new LangfuseClient();
      return client;
    });
  }
  return clientPromise;
}

function catalogEntry(name) {
  return MANAGED_PROMPTS.find((item) => item.name === name);
}

/**
 * @param {string} template
 * @param {Record<string, string>} variables
 */
export function compileMustache(template, variables = {}) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function compileEntry(entry, variables) {
  if (!variables || !Object.keys(variables).length) return entry.rawText;
  if (entry.langfusePrompt && typeof entry.langfusePrompt.compile === "function") {
    try {
      return entry.langfusePrompt.compile(variables);
    } catch (error) {
      console.warn(`[langfuse] compile ${entry.name}:`, error?.message || error);
    }
  }
  return compileMustache(entry.rawText, variables);
}

/**
 * @param {{ rootDir: string, fallbacks?: Record<string, string> }} options
 */
export function createPromptRegistry({ rootDir, fallbacks = {} }) {
  const cache = new Map();

  async function loadRawFromFile(name) {
    if (fallbacks[name]) return fallbacks[name];
    const meta = catalogEntry(name);
    if (!meta) throw new Error(`Unknown prompt: ${name}`);
    return readFile(promptFilePath(rootDir, meta.segments), "utf8");
  }

  async function fetchRemote(name) {
    const langfuse = await getClient();
    if (!langfuse) return null;
    const label = promptLabel();
    try {
      const remote = await langfuse.prompt.get(name, { label });
      const rawText =
        typeof remote.prompt === "string"
          ? remote.prompt
          : Array.isArray(remote.prompt)
            ? remote.prompt.map((m) => `${m.role}: ${m.content}`).join("\n")
            : String(remote.prompt ?? "");
      if (!rawText.trim()) return null;
      return {
        rawText,
        langfusePrompt: remote,
        source: "langfuse",
        label,
        version: remote.version,
        name: remote.name
      };
    } catch (error) {
      console.warn(`[langfuse] prompt get ${name} (${label}):`, error?.message || error);
      return null;
    }
  }

  /**
   * @param {string} name
   * @param {Record<string, string>} [variables]
   */
  async function get(name, variables = null) {
    const cacheKey = variables
      ? `${name}::${JSON.stringify(variables)}`
      : name;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.fetchedAt < refreshMs()) return cached.entry;

    const remote = await fetchRemote(name);
    let base;
    if (remote) {
      base = { ...remote, fetchedAt: now };
    } else {
      const rawText = await loadRawFromFile(name);
      base = {
        rawText,
        langfusePrompt: null,
        source: "file",
        label: promptLabel(),
        version: null,
        name,
        fetchedAt: now
      };
    }

    const text = compileEntry(base, variables);
    const entry = {
      name,
      text,
      rawText: base.rawText,
      langfusePrompt: base.langfusePrompt,
      source: base.source,
      label: base.label,
      version: base.version,
      variables: variables || null,
      fetchedAt: now
    };
    cache.set(cacheKey, { entry, fetchedAt: now });
    return entry;
  }

  function clear() {
    cache.clear();
  }

  async function status() {
    const entries = {};
    for (const item of MANAGED_PROMPTS) {
      const entry = await get(item.name);
      entries[item.name] = {
        source: entry.source,
        label: entry.label,
        version: entry.version,
        chars: entry.rawText.length,
        hasVariables: Boolean(item.variables)
      };
    }
    return {
      enabled: isLangfuseEnabled(),
      promptLabel: promptLabel(),
      refreshMs: refreshMs(),
      entries
    };
  }

  return { get, clear, status };
}
