/**
 * Langfuse tracing (OpenTelemetry + @langfuse/tracing).
 * Initialized after env load. No-op when keys are missing or LANGFUSE_TRACING_ENABLED=false.
 */

const env = globalThis.process?.env || {};

function langfuseBaseUrl() {
  return String(env.LANGFUSE_HOST || env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/+$/, "");
}

export function isLangfuseEnabled() {
  if (String(env.LANGFUSE_TRACING_ENABLED || "").toLowerCase() === "false") return false;
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);
}

function traceFullPrompt() {
  return String(env.LANGFUSE_TRACE_FULL_PROMPT || "").toLowerCase() === "true";
}

let sdk = null;
let spanProcessor = null;
let initPromise = null;

export async function initLangfuse() {
  if (!isLangfuseEnabled()) return false;
  if (sdk) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { NodeSDK } = await import("@opentelemetry/sdk-node");
      const { LangfuseSpanProcessor } = await import("@langfuse/otel");
      spanProcessor = new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: langfuseBaseUrl(),
        environment: env.NODE_ENV || "development"
      });
      sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
      sdk.start();
      return true;
    } catch (error) {
      console.warn("[langfuse] init failed:", error?.message || error);
      sdk = null;
      spanProcessor = null;
      return false;
    }
  })();

  return initPromise;
}

export async function flushLangfuse() {
  if (spanProcessor?.forceFlush) {
    try {
      await spanProcessor.forceFlush();
    } catch (error) {
      console.warn("[langfuse] flush failed:", error?.message || error);
    }
  }
}

export async function shutdownLangfuse() {
  await flushLangfuse();
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (error) {
    console.warn("[langfuse] shutdown failed:", error?.message || error);
  } finally {
    sdk = null;
    spanProcessor = null;
    initPromise = null;
  }
}

function clip(text = "", max = 4000) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const userMovePatterns = [
  { userMove: "off_topic", pattern: /프롬프트|AI|시스템|앱|코딩|검색|사귀|고백|데이트|스킨십/i },
  { userMove: "pressure", pattern: /그냥 믿|믿어야|교회 나와|회개해야|안 믿으면|무조건|당장|반드시/ },
  { userMove: "cross_resurrection", pattern: /십자가|부활|예수.*죽|살아나|대속|죽으셨|다시 사/ },
  { userMove: "sin_repentance", pattern: /죄|회개|잘못|하나님 앞|기준|거룩/ },
  { userMove: "faith_salvation", pattern: /믿음|구원|영생|은혜|행위|선행|믿는/ },
  { userMove: "god_love", pattern: /하나님.*사랑|사랑하|존재.*가치|성과.*아니|있는 그대로/ },
  { userMove: "personal_witness", pattern: /나도.*(겪|경험|느꼈|배웠|믿게|알게)|내가.*(겪|경험|느꼈|배웠|믿게|알게)|내 경험|간증/ },
  { userMove: "empathy", pattern: /힘들었겠다|그랬구나|이해돼|그럴 수 있|듣고 있어|속상했겠다|외로웠겠다/ },
  { userMove: "question", pattern: /\?|어떻게|왜|무슨|궁금|뭐가|어떤/ }
];

function detectUserMoveForTrace(message = {}) {
  const content = String(message.content || "").trim();
  if (!content) return { userMove: "smalltalk", evidence: ["empty"] };
  for (const entry of userMovePatterns) {
    const match = content.match(entry.pattern);
    if (match) return { userMove: entry.userMove, evidence: [match[0]] };
  }
  if (/안녕|요즘|근황|뭐해|밥|커피|괜찮/.test(content) || content.length < 18) {
    return { userMove: "smalltalk", evidence: ["short-or-smalltalk"] };
  }
  return { userMove: "listening", evidence: ["fallback"] };
}

function selectPasForTrace(persona, detectedMove, limit = 1) {
  const pasMap = persona.roleplayTemplate?.pasMap || [];
  if (!pasMap.length) return [];
  const userMove = detectedMove?.userMove || "listening";
  const match = pasMap.find((entry) => entry.userMove === userMove);
  if (match) return [match];
  return pasMap.slice(0, limit);
}

function featureTagForEventType(eventType = "") {
  if (String(eventType).startsWith("feedback")) return "feedback";
  if (String(eventType).includes("opening")) return "opening-lines";
  return "roleplay";
}

function buildGenerationInput({ prompt = {}, lastUser, fullPrompt }) {
  const userMessage = clip(lastUser?.content, 2000);
  if (fullPrompt) {
    return {
      userMessage,
      instructionsPreview: clip(prompt.instructions, 2000),
      dynamicInput: clip(prompt.dynamicInput, 12000)
    };
  }
  return {
    userMessage: userMessage || "(no user message)",
    dynamicInputPreview: clip(prompt.dynamicInput, 600),
    instructionsLength: String(prompt.instructions || "").length,
    staticBlocksLength: String((prompt.staticSystemBlocks || []).join("\n")).length
  };
}

/**
 * Trace context for callModelWithUsage — persona/session aware.
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
  const detected = lastUser ? detectUserMoveForTrace(lastUser) : { userMove: "smalltalk", evidence: [] };
  const pasEntries = selectPasForTrace(persona, detected, 1);
  const selectedPas = pasEntries[0] || null;
  const turnCount = (messages || []).filter((m) => m.role === "user").length;
  const feature = featureTagForEventType(eventType);

  const traceInput = {
    eventType,
    turn: turnCount,
    userMessage: lastUser?.content ? clip(lastUser.content, 2000) : "(session start — no user turn yet)"
  };

  const generationInput = buildGenerationInput({
    prompt,
    lastUser,
    fullPrompt: traceFullPrompt()
  });

  return {
    name: `persona-gospel/${eventType}`,
    sessionId: conversationId || undefined,
    userId: userId || undefined,
    langfusePrompt,
    traceInput,
    generationInput,
    tags: [
      `feature:${feature}`,
      `persona:${persona.id || "unknown"}`,
      `goal:${session.goal || "unknown"}`,
      `relationship:${session.relationship || "unknown"}`,
      `setting:${session.setting || "unknown"}`,
      `user_move:${detected.userMove}`
    ],
    metadata: {
      eventType,
      feature,
      promptSource: promptSource || (langfusePrompt ? "langfuse" : "file"),
      promptVersion,
      personaId: persona.id,
      personaName: persona.name,
      personaTitle: persona.title,
      coreTrait: persona.roleplayTemplate?.coreStack?.coreTrait || "",
      lateBarrier: persona.roleplayTemplate?.lateSessionTension?.coreQuestion || "",
      userMove: detected.userMove,
      userMoveEvidence: detected.evidence,
      selectedPasId: selectedPas?.id || "",
      selectedPasTrigger: selectedPas?.trigger || "",
      turnCount
    }
  };
}

/**
 * Nested trace: span (turn) → generation (llm-completion).
 * Trace I/O = user message / assistant reply (skill: meaningful input only).
 */
export async function traceModelCall({
  name,
  sessionId,
  userId,
  tags = [],
  metadata = {},
  traceInput = {},
  generationInput = {},
  model,
  provider = "",
  modelType,
  langfusePrompt = null,
  run
}) {
  const ready = await initLangfuse();
  if (!ready) return run();

  const {
    startActiveObservation,
    propagateAttributes,
    setActiveTraceIO
  } = await import("@langfuse/tracing");

  const promptMeta = langfusePrompt
    ? {
        promptName: langfusePrompt.name,
        promptVersion: langfusePrompt.version,
        promptLabel: metadata.promptLabel || langfusePrompt.labels?.[0]
      }
    : {};

  const allTags = provider ? [...tags, `provider:${provider}`] : tags;
  const spanMetadata = { ...metadata, modelType, model, provider, ...promptMeta };

  return propagateAttributes(
    {
      sessionId,
      userId,
      tags: allTags,
      metadata: spanMetadata
    },
    async () =>
      startActiveObservation(
        name,
        async () => {
          setActiveTraceIO({ input: traceInput });

          const result = await startActiveObservation(
            "llm-completion",
            async (generation) => {
              generation.update({
                input: generationInput,
                model,
                metadata: spanMetadata,
                ...(langfusePrompt ? { prompt: langfusePrompt } : {})
              });
              const output = await run();
              generation.update({
                output: clip(output.text, 4000),
                model: output.model || model,
                usageDetails: {
                  input: output.usage?.inputTokens ?? 0,
                  output: output.usage?.outputTokens ?? 0,
                  total: (output.usage?.inputTokens || 0) + (output.usage?.outputTokens || 0)
                }
              });
              return output;
            },
            { asType: "generation" }
          );

          setActiveTraceIO({
            input: traceInput,
            output: { assistantMessage: clip(result.text, 2000) }
          });

          return result;
        },
        { asType: "span" }
      )
  );
}
