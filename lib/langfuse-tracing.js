import { personaAdvisory, selectPasEntries } from "./persona-advisory.js";

/**
 * Optional Langfuse tracing for Persona Gospel LLM calls.
 * No-op when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset.
 */

const env = globalThis.process?.env || {};

function langfuseBaseUrl() {
  return String(env.LANGFUSE_HOST || env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/+$/, "");
}

export function isLangfuseEnabled() {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);
}

let sdk = null;
let initPromise = null;

export async function initLangfuse() {
  if (!isLangfuseEnabled()) return false;
  if (sdk) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { NodeSDK } = await import("@opentelemetry/sdk-node");
      const { LangfuseSpanProcessor } = await import("@langfuse/otel");
      const processor = new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: langfuseBaseUrl(),
        environment: env.NODE_ENV || "development"
      });
      sdk = new NodeSDK({ spanProcessors: [processor] });
      sdk.start();
      return true;
    } catch (error) {
      console.warn("[langfuse] init failed:", error?.message || error);
      sdk = null;
      return false;
    }
  })();

  return initPromise;
}

export async function shutdownLangfuse() {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (error) {
    console.warn("[langfuse] shutdown failed:", error?.message || error);
  } finally {
    sdk = null;
    initPromise = null;
  }
}

function clip(text = "", max = 4000) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Build trace metadata from persona + session + prompt assembly.
 */
export function buildPersonaTraceContext({
  eventType = "chat",
  userId = "",
  conversationId = "",
  session = {},
  persona = {},
  messages = [],
  prompt = {},
  langfusePrompt = null,
  promptSource = "",
  promptVersion = null
}) {
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user");
  const detected = personaAdvisory(persona, messages);
  const pasEntries = selectPasEntries(persona, detected, 1);
  const selectedPas = pasEntries[0] || null;

  return {
    name: `persona-gospel/${eventType}`,
    sessionId: conversationId || undefined,
    userId: userId || undefined,
    langfusePrompt,
    tags: [
      `persona:${persona.id || "unknown"}`,
      `goal:${session.goal || "unknown"}`,
      `relationship:${session.relationship || "unknown"}`,
      `setting:${session.setting || "unknown"}`,
      `user_move:${detected.userMove}`
    ],
    metadata: {
      promptSource: promptSource || (langfusePrompt ? "langfuse" : "file"),
      promptVersion,
      personaId: persona.id,
      personaName: persona.name,
      personaTitle: persona.title,
      coreTrait: persona.roleplayTemplate?.coreStack?.coreTrait || "",
      lateBarrier: persona.roleplayTemplate?.lateSessionTension?.coreQuestion || "",
      userMove: detected.userMove,
      userMoveEvidence: detected.evidence,
      userMoveUncertain: detected.uncertain,
      userMoveReason: detected.reason,
      selectedPasId: selectedPas?.id || "",
      selectedPasTrigger: selectedPas?.trigger || "",
      turnCount: (messages || []).filter((m) => m.role === "user").length,
      dynamicInputChars: String(prompt.dynamicInput || "").length,
      staticInputChars: String((prompt.staticSystemBlocks || []).join("\n")).length
    },
    input: {
      instructionsPreview: clip(prompt.instructions, 500),
      dynamicInput: clip(prompt.dynamicInput, 8000),
      userMessage: clip(lastUser?.content, 2000)
    }
  };
}

export async function traceModelCall({
  name,
  sessionId,
  userId,
  tags = [],
  metadata = {},
  input = {},
  model,
  modelType,
  langfusePrompt = null,
  run
}) {
  const ready = await initLangfuse();
  if (!ready) return run();

  const { startActiveObservation, propagateAttributes } = await import("@langfuse/tracing");

  const promptMeta = langfusePrompt
    ? {
        promptName: langfusePrompt.name,
        promptVersion: langfusePrompt.version,
        promptLabel: metadata.promptLabel || langfusePrompt.labels?.[0]
      }
    : {};

  return propagateAttributes(
    {
      sessionId,
      userId,
      tags,
      metadata: { ...metadata, ...promptMeta }
    },
    async () =>
      startActiveObservation(
        name,
        async (observation) => {
          observation.update({
            input,
            metadata: { ...metadata, modelType, model, ...promptMeta },
            ...(langfusePrompt ? { prompt: langfusePrompt } : {})
          });
          const result = await run();
          observation.update({
            output: clip(result.text, 4000),
            model: result.model,
            usageDetails: {
              input: result.usage?.inputTokens,
              output: result.usage?.outputTokens,
              total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
            }
          });
          return result;
        },
        { asType: "generation" }
      )
  );
}
