/**
 * Langfuse Prompt Management with file fallback.
 * Label: LANGFUSE_PROMPT_LABEL (default production). Use staging for experiments.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

/**
 * @param {{ rootDir: string, fallbacks: Record<string, string> }} options
 */
export function createPromptRegistry({ rootDir, fallbacks = {} }) {
  const cache = new Map();

  async function loadFromFile(name) {
    if (fallbacks[name]) return fallbacks[name];
    if (name === "roleplay/persona-system") {
      return readFile(join(rootDir, "prompts", "persona-system-prompt.md"), "utf8");
    }
    if (name === "roleplay/feedback-system") {
      return readFile(join(rootDir, "prompts", "feedback-prompt.md"), "utf8");
    }
    throw new Error(`Unknown prompt: ${name}`);
  }

  async function fetchRemote(name) {
    const langfuse = await getClient();
    if (!langfuse) return null;
    const label = promptLabel();
    try {
      const remote = await langfuse.prompt.get(name, { label });
      const text = typeof remote.prompt === "string" ? remote.prompt : String(remote.prompt ?? "");
      if (!text.trim()) return null;
      return {
        text,
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

  async function get(name) {
    const now = Date.now();
    const cached = cache.get(name);
    if (cached && now - cached.fetchedAt < refreshMs()) return cached.entry;

    const remote = await fetchRemote(name);
    if (remote) {
      const entry = { ...remote, fetchedAt: now };
      cache.set(name, { entry, fetchedAt: now });
      return entry;
    }

    const text = await loadFromFile(name);
    const entry = {
      text,
      langfusePrompt: null,
      source: "file",
      label: promptLabel(),
      version: null,
      name,
      fetchedAt: now
    };
    cache.set(name, { entry, fetchedAt: now });
    return entry;
  }

  function clear() {
    cache.clear();
  }

  async function status() {
    const names = ["roleplay/persona-system", "roleplay/feedback-system"];
    const entries = {};
    for (const name of names) {
      const entry = await get(name);
      entries[name] = {
        source: entry.source,
        label: entry.label,
        version: entry.version,
        chars: entry.text.length
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
