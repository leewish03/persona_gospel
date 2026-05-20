import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
loadLocalEnv(join(rootDir, ".env"));
const publicDir = join(rootDir, "public");
const isProduction = globalThis.process?.env?.NODE_ENV === "production";
const port = Number(globalThis.process?.env?.PORT || (isProduction ? 10000 : 4173));
const host = globalThis.process?.env?.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
const appBaseUrl = globalThis.process?.env?.APP_BASE_URL || globalThis.process?.env?.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
const appOpenAIKey = globalThis.process?.env?.OPENAI_API_KEY || "";
const appAnthropicKey = globalThis.process?.env?.ANTHROPIC_API_KEY || globalThis.process?.env?.CLAUDE_API_KEY || "";
const appChatModel =
  globalThis.process?.env?.OPENAI_CHAT_MODEL || globalThis.process?.env?.OPENAI_MODEL || "gpt-5.4-mini";
const appFeedbackModel =
  globalThis.process?.env?.OPENAI_FEEDBACK_MODEL || globalThis.process?.env?.OPENAI_MODEL || "gpt-5.4";
const appChatReasoningEffort =
  globalThis.process?.env?.OPENAI_CHAT_REASONING_EFFORT || globalThis.process?.env?.OPENAI_REASONING_EFFORT || "high";
const appFeedbackReasoningEffort =
  globalThis.process?.env?.OPENAI_FEEDBACK_REASONING_EFFORT || globalThis.process?.env?.OPENAI_REASONING_EFFORT || "medium";
const devAuthEnabled = globalThis.process?.env?.ENABLE_DEV_LOGIN === "true" || !isProduction;
const adminEmails = new Set(
  String(globalThis.process?.env?.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);
const sessionSecret =
  globalThis.process?.env?.SESSION_SECRET ||
  globalThis.process?.env?.GOOGLE_CLIENT_SECRET ||
  globalThis.process?.env?.KAKAO_CLIENT_SECRET ||
  "";
const storageDir = globalThis.process?.env?.STORAGE_DIR || join(rootDir, "storage");
const dbPath = join(storageDir, "db.json");
const supabaseUrl = String(globalThis.process?.env?.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseServiceRoleKey = globalThis.process?.env?.SUPABASE_SERVICE_ROLE_KEY || "";
const usdToKrw = Number(globalThis.process?.env?.USD_TO_KRW || 1480);
const exchangeRateApiUrl =
  globalThis.process?.env?.EXCHANGE_RATE_API_URL || "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW";
const exchangeRateRefreshMs = Number(globalThis.process?.env?.EXCHANGE_RATE_REFRESH_MS || 6 * 60 * 60 * 1000);
const exchangeRateTimeoutMs = Number(globalThis.process?.env?.EXCHANGE_RATE_TIMEOUT_MS || 4000);
const chatInputPrice = Number(globalThis.process?.env?.OPENAI_CHAT_INPUT_USD_PER_1M || 0.75);
const chatOutputPrice = Number(globalThis.process?.env?.OPENAI_CHAT_OUTPUT_USD_PER_1M || 4.5);
const feedbackInputPrice = Number(globalThis.process?.env?.OPENAI_FEEDBACK_INPUT_USD_PER_1M || 2.5);
const feedbackOutputPrice = Number(globalThis.process?.env?.OPENAI_FEEDBACK_OUTPUT_USD_PER_1M || 15);
/** Anthropic USD per 1M tokens (docs.claude.com pricing, 2026-05 기준 대표값; 환경변수로 덮어쓰기) */
const anthropicChatSonnetInput = Number(globalThis.process?.env?.ANTHROPIC_CHAT_SONNET_INPUT_USD_PER_1M || 3);
const anthropicChatSonnetOutput = Number(globalThis.process?.env?.ANTHROPIC_CHAT_SONNET_OUTPUT_USD_PER_1M || 15);
const anthropicChatOpusInput = Number(globalThis.process?.env?.ANTHROPIC_CHAT_OPUS_INPUT_USD_PER_1M || 5);
const anthropicChatOpusOutput = Number(globalThis.process?.env?.ANTHROPIC_CHAT_OPUS_OUTPUT_USD_PER_1M || 25);
const anthropicChatHaikuInput = Number(globalThis.process?.env?.ANTHROPIC_CHAT_HAIKU_INPUT_USD_PER_1M || 1);
const anthropicChatHaikuOutput = Number(globalThis.process?.env?.ANTHROPIC_CHAT_HAIKU_OUTPUT_USD_PER_1M || 5);
const anthropicFeedbackSonnetInput = Number(globalThis.process?.env?.ANTHROPIC_FEEDBACK_SONNET_INPUT_USD_PER_1M || anthropicChatSonnetInput);
const anthropicFeedbackSonnetOutput = Number(globalThis.process?.env?.ANTHROPIC_FEEDBACK_SONNET_OUTPUT_USD_PER_1M || anthropicChatSonnetOutput);
const anthropicFeedbackOpusInput = Number(globalThis.process?.env?.ANTHROPIC_FEEDBACK_OPUS_INPUT_USD_PER_1M || anthropicChatOpusInput);
const anthropicFeedbackOpusOutput = Number(globalThis.process?.env?.ANTHROPIC_FEEDBACK_OPUS_OUTPUT_USD_PER_1M || anthropicChatOpusOutput);
const anthropicFeedbackHaikuInput = Number(globalThis.process?.env?.ANTHROPIC_FEEDBACK_HAIKU_INPUT_USD_PER_1M || anthropicChatHaikuInput);
const anthropicFeedbackHaikuOutput = Number(globalThis.process?.env?.ANTHROPIC_FEEDBACK_HAIKU_OUTPUT_USD_PER_1M || anthropicChatHaikuOutput);
const sessions = new Map();
const oauthStates = new Map();
const openingLineJobs = new Map();
let exchangeRateState = {
  usdToKrw,
  source: "fallback",
  provider: "env",
  fetchedAt: "",
  date: "",
  error: ""
};

function loadLocalEnv(path) {
  if (globalThis.process?.env?.NODE_ENV === "production" || !existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (globalThis.process.env[key] === undefined) globalThis.process.env[key] = value;
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8"
};

const personaPrompt = await readFile(join(rootDir, "prompts", "persona-system-prompt.md"), "utf8");
const feedbackPrompt = await readFile(join(rootDir, "prompts", "feedback-prompt.md"), "utf8");
const personas = JSON.parse(await readFile(join(rootDir, "data", "personas.json"), "utf8"));
const defaultSettings = {
  donation: {
    title: "후원",
    body: "이 앱의 AI 호출 비용은 운영자가 부담합니다. 지속 운영을 돕고 싶다면 아래 안내를 통해 자발적으로 후원할 수 있습니다.",
    account: "",
    enabled: true
  },
  cost: {
    usdToKrw,
    monthlyBudgetKrw: 0
  },
  openingLines: {
    latest: null
  },
  ai: {
    chat: {
      provider: "openai",
      model: appChatModel,
      maxOutputTokens: 1400,
      temperature: "",
      topP: "",
      reasoningEffort: appChatReasoningEffort || "none",
      thinkingType: "disabled",
      thinkingBudgetTokens: 0,
      thinkingDisplay: "omitted"
    },
    feedback: {
      provider: "openai",
      model: appFeedbackModel,
      maxOutputTokens: 2600,
      temperature: "",
      topP: "",
      reasoningEffort: appFeedbackReasoningEffort || "medium",
      thinkingType: "disabled",
      thinkingBudgetTokens: 0,
      thinkingDisplay: "omitted"
    }
  }
};

const db = await loadDb();
initializeExchangeRateState();
await refreshUsdToKrw({ force: true, persist: true });
const exchangeRateTimer = setInterval(() => {
  refreshUsdToKrw({ persist: true }).catch((error) => {
    console.error("Exchange rate refresh failed.", error);
  });
}, exchangeRateRefreshMs);
exchangeRateTimer.unref?.();

function emptyDb() {
  return {
    users: [],
    conversations: [],
    usageEvents: [],
    settings: structuredClone(defaultSettings)
  };
}

async function loadDb() {
  await mkdir(storageDir, { recursive: true });
  if (supabaseUrl && supabaseServiceRoleKey) {
    try {
      return await loadSupabaseDb();
    } catch (error) {
      console.error("Supabase load failed. Falling back to JSON storage.", error);
    }
  }
  try {
    const data = JSON.parse(await readFile(dbPath, "utf8"));
    const empty = emptyDb();
    return {
      users: Array.isArray(data.users) ? data.users : [],
      conversations: Array.isArray(data.conversations) ? data.conversations : [],
      usageEvents: Array.isArray(data.usageEvents) ? data.usageEvents : [],
      settings: mergeSettings(empty.settings, data.settings || {})
    };
  } catch {
    const empty = emptyDb();
    await writeFile(dbPath, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function saveDb() {
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
  if (supabaseUrl && supabaseServiceRoleKey) {
    try {
      await saveSupabaseDb();
    } catch (error) {
      console.error("Supabase save failed. JSON storage was still updated.", error);
    }
  }
}

function mergeSettings(base, incoming) {
  return {
    donation: { ...(base.donation || {}), ...(incoming.donation || {}) },
    cost: { ...(base.cost || {}), ...(incoming.cost || {}) },
    openingLines: { ...(base.openingLines || {}), ...(incoming.openingLines || {}) },
    ai: mergeAiSettings(base.ai || {}, incoming.ai || {})
  };
}

function mergeAiSettings(base = {}, incoming = {}) {
  return {
    chat: { ...(base.chat || {}), ...(incoming.chat || {}) },
    feedback: { ...(base.feedback || {}), ...(incoming.feedback || {}) }
  };
}

function cleanOptionalNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Math.min(max, Math.max(min, number));
}

function sanitizeModelSettings(input = {}, fallback = {}) {
  const provider = input.provider === "anthropic" ? "anthropic" : "openai";
  const model = String(input.model || fallback.model || "").trim();
  const maxOutputTokens = cleanOptionalNumber(input.maxOutputTokens, { min: 1, max: 64000 }) || fallback.maxOutputTokens || 900;
  const reasoningEffort = ["", "none", "minimal", "low", "medium", "high", "xhigh"].includes(input.reasoningEffort)
    ? input.reasoningEffort
    : fallback.reasoningEffort || "none";
  const thinkingType = ["disabled", "adaptive", "enabled"].includes(input.thinkingType)
    ? input.thinkingType
    : fallback.thinkingType || "disabled";
  const thinkingDisplay = ["omitted", "summarized"].includes(input.thinkingDisplay)
    ? input.thinkingDisplay
    : fallback.thinkingDisplay || "omitted";

  let thinkingBudgetTokens = cleanOptionalNumber(input.thinkingBudgetTokens, { min: 1024, max: 64000 }) || 0;
  if (thinkingType === "enabled" && thinkingBudgetTokens < 1024) {
    thinkingBudgetTokens = 8192;
  }

  return {
    provider,
    model,
    maxOutputTokens,
    temperature: cleanOptionalNumber(input.temperature, { min: 0, max: 2 }),
    topP: cleanOptionalNumber(input.topP, { min: 0, max: 1 }),
    reasoningEffort,
    thinkingType,
    thinkingBudgetTokens,
    thinkingDisplay
  };
}

function sanitizeSettings(input = {}) {
  const merged = mergeSettings(defaultSettings, input);
  const exchangeRate = merged.cost.exchangeRate || {};
  return {
    donation: {
      title: String(merged.donation.title || "후원"),
      body: String(merged.donation.body || ""),
      account: String(merged.donation.account || ""),
      enabled: merged.donation.enabled !== false
    },
    cost: {
      usdToKrw: Number(merged.cost.usdToKrw || usdToKrw),
      monthlyBudgetKrw: Number(merged.cost.monthlyBudgetKrw || 0),
      exchangeRate: {
        source: String(exchangeRate.source || ""),
        provider: String(exchangeRate.provider || ""),
        url: String(exchangeRate.url || ""),
        date: String(exchangeRate.date || ""),
        fetchedAt: String(exchangeRate.fetchedAt || ""),
        error: String(exchangeRate.error || "")
      }
    },
    ai: {
      chat: sanitizeModelSettings(merged.ai.chat, defaultSettings.ai.chat),
      feedback: sanitizeModelSettings(merged.ai.feedback, defaultSettings.ai.feedback)
    },
    openingLines: sanitizeOpeningLinesSettings(merged.openingLines)
  };
}

function sanitizeOpeningLinesSettings(input = {}) {
  const latest = input?.latest && typeof input.latest === "object" ? input.latest : null;
  return { latest: latest ? publicOpeningLineResult(latest) : null };
}

function initializeExchangeRateState() {
  const cost = db.settings?.cost || {};
  const meta = cost.exchangeRate || {};
  const storedRate = Number(cost.usdToKrw || usdToKrw);
  exchangeRateState = {
    usdToKrw: Number.isFinite(storedRate) && storedRate > 0 ? storedRate : usdToKrw,
    source: meta.source || "stored",
    provider: meta.provider || "settings",
    url: meta.url || "",
    fetchedAt: meta.fetchedAt || "",
    date: meta.date || "",
    error: meta.error || ""
  };
}

function currentUsdToKrw() {
  const liveRate = Number(exchangeRateState.usdToKrw || 0);
  if (Number.isFinite(liveRate) && liveRate > 0) return liveRate;
  const settingsRate = Number(db.settings?.cost?.usdToKrw || 0);
  if (Number.isFinite(settingsRate) && settingsRate > 0) return settingsRate;
  return usdToKrw;
}

function parseUsdToKrwRate(data) {
  const candidates = [
    data?.rates?.KRW,
    data?.conversion_rates?.KRW,
    data?.rate,
    data?.result,
    Array.isArray(data) ? data.find((item) => item?.quote === "KRW")?.rate : undefined
  ];
  const rate = Number(candidates.find((value) => Number.isFinite(Number(value))));
  if (!Number.isFinite(rate) || rate < 500 || rate > 2500) {
    throw new Error("USD/KRW 환율 응답을 해석하지 못했습니다.");
  }
  return rate;
}

function exchangeRateDateFrom(data) {
  if (typeof data?.date === "string") return data.date;
  if (Array.isArray(data)) {
    const row = data.find((item) => item?.quote === "KRW") || data[0];
    if (typeof row?.date === "string") return row.date;
  }
  return "";
}

async function refreshUsdToKrw({ force = false, persist = false } = {}) {
  const fetchedAt = exchangeRateState.fetchedAt ? Date.parse(exchangeRateState.fetchedAt) : 0;
  if (!force && fetchedAt && Date.now() - fetchedAt < exchangeRateRefreshMs) return exchangeRateState;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), exchangeRateTimeoutMs);
  try {
    const response = await fetch(exchangeRateApiUrl, { signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`환율 API 요청 실패: ${response.status}`);

    const rate = Number(parseUsdToKrwRate(data).toFixed(2));
    const nextState = {
      usdToKrw: rate,
      source: "api",
      provider: "frankfurter",
      url: exchangeRateApiUrl,
      fetchedAt: new Date().toISOString(),
      date: exchangeRateDateFrom(data),
      error: ""
    };
    exchangeRateState = nextState;
    db.settings = mergeSettings(db.settings, {
      cost: {
        usdToKrw: rate,
        exchangeRate: nextState
      }
    });
    if (persist) await saveDb();
    return nextState;
  } catch (error) {
    const message = error?.name === "AbortError" ? "환율 API 요청 시간 초과" : error?.message || "환율 API 요청 실패";
    exchangeRateState = { ...exchangeRateState, error: message };
    db.settings = mergeSettings(db.settings, {
      cost: {
        usdToKrw: currentUsdToKrw(),
        exchangeRate: { ...exchangeRateState, error: message }
      }
    });
    if (persist) await saveDb();
    return exchangeRateState;
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error || `Supabase request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

function supabaseUserToApp(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.provider_id,
    email: row.email || "",
    displayName: row.display_name || "",
    avatarUrl: row.avatar_url || "",
    role: row.role || "user",
    profile: row.profile || {},
    disabledAt: row.disabled_at || "",
    lastLoginAt: row.last_login_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function appUserToSupabase(user) {
  return {
    id: user.id,
    provider: user.provider,
    provider_id: user.providerId,
    email: user.email || null,
    display_name: user.displayName || "",
    avatar_url: user.avatarUrl || "",
    role: user.role || "user",
    profile: user.profile || {},
    disabled_at: user.disabledAt || null,
    last_login_at: user.lastLoginAt || null,
    created_at: user.createdAt,
    updated_at: user.updatedAt
  };
}

function supabaseConversationToApp(row, messages = []) {
  return {
    id: row.id,
    userId: row.user_id,
    session: {
      personaId: row.persona_id,
      relationship: row.relationship,
      setting: row.setting,
      goal: row.goal
    },
    messages,
    feedbackText: row.feedback_text || "",
    feedbackSummary: row.feedback_summary || "",
    status: row.status || "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at || ""
  };
}

function appConversationToSupabase(conversation) {
  return {
    id: conversation.id,
    user_id: conversation.userId,
    persona_id: conversation.session?.personaId || "",
    relationship: conversation.session?.relationship || "",
    setting: conversation.session?.setting || "",
    goal: conversation.session?.goal || "",
    status: conversation.status || "active",
    feedback_text: conversation.feedbackText || "",
    feedback_summary: conversation.feedbackSummary || summarizeFeedback(conversation.feedbackText || ""),
    message_count: conversation.messages?.length || 0,
    user_message_count: (conversation.messages || []).filter((message) => message.role === "user").length,
    assistant_message_count: (conversation.messages || []).filter((message) => message.role === "assistant").length,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    finished_at: conversation.finishedAt || null
  };
}

function supabaseUsageToApp(row) {
  return {
    id: row.id,
    userId: row.user_id || "",
    conversationId: row.conversation_id || "",
    eventType: row.event_type,
    model: row.model || "",
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    estimatedCostUsd: Number(row.estimated_cost_usd || 0),
    estimatedCostKrw: Number(row.estimated_cost_krw || 0),
    createdAt: row.created_at
  };
}

function appUsageToSupabase(event) {
  return {
    id: event.id,
    user_id: event.userId || null,
    conversation_id: event.conversationId || null,
    event_type: event.eventType,
    model: event.model || "",
    input_tokens: event.inputTokens || 0,
    output_tokens: event.outputTokens || 0,
    estimated_cost_usd: event.estimatedCostUsd || 0,
    estimated_cost_krw: event.estimatedCostKrw || 0,
    created_at: event.createdAt
  };
}

async function loadSupabaseDb() {
  const [users, conversations, messages, usageEvents, settingsRows] = await Promise.all([
    supabaseRequest("app_users?select=*"),
    supabaseRequest("conversations?select=*&order=created_at.desc"),
    supabaseRequest("conversation_messages?select=*&order=sort_order.asc"),
    supabaseRequest("usage_events?select=*&order=created_at.desc&limit=5000"),
    supabaseRequest("app_settings?select=*")
  ]);

  const messagesByConversation = new Map();
  for (const row of messages || []) {
    const list = messagesByConversation.get(row.conversation_id) || [];
    list.push({ role: row.role, content: row.content });
    messagesByConversation.set(row.conversation_id, list);
  }

  const settings = structuredClone(defaultSettings);
  for (const row of settingsRows || []) {
    if (row.key === "operations") Object.assign(settings, mergeSettings(settings, row.value || {}));
  }

  return {
    users: (users || []).map(supabaseUserToApp),
    conversations: (conversations || []).map((row) => supabaseConversationToApp(row, messagesByConversation.get(row.id) || [])),
    usageEvents: (usageEvents || []).map(supabaseUsageToApp),
    settings
  };
}

async function saveSupabaseDb() {
  if (db.users.length) await supabaseRequest("app_users?on_conflict=id", { method: "POST", body: db.users.map(appUserToSupabase) });
  if (db.conversations.length) {
    await supabaseRequest("conversations?on_conflict=id", {
      method: "POST",
      body: db.conversations.map(appConversationToSupabase)
    });
  }
  if (db.usageEvents.length) {
    await supabaseRequest("usage_events?on_conflict=id", { method: "POST", body: db.usageEvents.map(appUsageToSupabase) });
  }
  await supabaseRequest("app_settings?on_conflict=key", {
    method: "POST",
    body: [{ key: "operations", value: db.settings, updated_at: new Date().toISOString() }]
  });

  for (const conversation of db.conversations) {
    if (!conversation.messages?.length) continue;
    await supabaseRequest(`conversation_messages?conversation_id=eq.${encodeURIComponent(conversation.id)}`, { method: "DELETE" });
    await supabaseRequest("conversation_messages", {
      method: "POST",
      body: conversation.messages.map((message, index) => ({
        id: randomUUID(),
        conversation_id: conversation.id,
        role: message.role,
        content: message.content,
        sort_order: index,
        created_at: conversation.createdAt
      }))
    });
  }
}

const relationshipLabels = {
  first_meeting: "처음 만난 사람",
  acquaintance: "안면만 있는 사람",
  casual_friend: "편한 지인",
  old_friend: "오래된 친구",
  prior_faith_talk: "이미 신앙 이야기를 해본 사람"
};

const relationshipGuidance = {
  first_meeting: "사용자와 페르소나는 지금 처음 대화하는 사이다. 페르소나는 조심스럽고 예의 있게 말하며, 사용자를 오래 알던 사람처럼 대하지 않는다. '오랜만', '전에 말했듯이', '네가 알잖아'처럼 이전 관계를 암시하는 표현을 쓰지 않는다. 사적인 고민은 암시할 수 있지만 바로 깊게 털어놓지 않는다.",
  acquaintance: "사용자와 페르소나는 얼굴은 알지만 깊은 사이는 아니다. 페르소나는 편한 존댓말이나 조심스러운 말투로 답하고, 사용자가 잘 들어도 속마음은 조금씩만 드러낸다. 오래된 친구처럼 모든 배경을 공유한 톤은 피한다.",
  casual_friend: "사용자와 페르소나는 편하게 근황과 고민을 나눌 수 있는 지인이다. 페르소나는 너무 격식 차리지는 않지만, 모든 것을 다 아는 오래된 친구처럼 말하지 않는다. 사용자의 접근이 좋으면 고민을 한 단계 더 구체화한다.",
  old_friend: "사용자와 페르소나는 오래 알고 지낸 친구다. 페르소나는 비교적 편하게 말하고 과거 맥락이나 오랜만이라는 느낌을 사용할 수 있다. 단, 이 친밀감이 연애 감정이나 과도한 의존으로 흐르지 않게 한다.",
  prior_faith_talk: "사용자와 페르소나는 예전에 신앙 이야기를 해본 적이 있다. 페르소나는 그때의 반응이나 남은 거리감을 살짝 기억하는 듯 반응한다. 사용자가 다시 신앙 이야기를 꺼내면 즉시 수긍하지 않고, 예전의 부담감이나 궁금함을 이어서 드러낸다."
};

const settingLabels = {
  cafe_catchup: "카페에서 대화를 나누는 중",
  meal_after_group: "식사/모임 후 둘만 남아 이야기하는 중",
  walk_after_work: "퇴근길에 함께 걸어가는 중",
  late_night_dm: "밤에 카톡/DM으로 진지한 이야기가 이어지는 중",
  campus_or_office_break: "학교/직장 쉬는 시간에 잠깐 마주 앉은 중",
  concern_shared: "페르소나가 고민을 털어놓은 직후",
  faith_topic_arose: "신앙/교회 이야기가 자연스럽게 언급된 직후"
};

const settingGuidance = {
  cafe_catchup: "사용자와 페르소나가 카페에서 음료를 두고 대화를 나누는 중이다. 첫 응답에는 카페, 커피, 앉아서 이야기하는 분위기 중 최소 하나가 자연스럽게 들어가야 한다. 관계가 old_friend가 아니라면 '오랜만' 같은 이전 관계 표현을 쓰지 않는다.",
  meal_after_group: "식사나 모임이 끝나고 사용자와 페르소나 둘만 남아 이야기하는 중이다. 첫 응답에는 모임이 끝난 뒤의 여운, 주변이 조용해진 느낌, 둘만 남은 분위기 중 하나가 들어가야 한다. 페르소나는 사용자를 상담자로 대하지 말고 자기 반응을 말한다.",
  walk_after_work: "사용자와 페르소나가 퇴근길에 함께 걸어가며 이야기하는 중이다. 첫 응답에는 퇴근길, 걷는 중, 저녁 공기, 피곤함, 집에 가는 길 중 하나가 자연스럽게 들어가야 한다. 페르소나는 사용자의 고민을 묻는 사람이 아니라, 자기 상황과 반응을 가진 상대역이다.",
  late_night_dm: "사용자와 페르소나가 밤에 카톡이나 DM으로 진지한 이야기를 이어가는 중이다. 첫 응답은 짧은 메시지처럼 자연스럽고, 밤 시간대나 늦은 답장 느낌이 있어야 한다. 감정적 친밀감이 생겨도 연애나 의존 관계로 흐르지 않는다.",
  campus_or_office_break: "사용자와 페르소나가 학교나 직장 쉬는 시간에 잠깐 마주 앉아 이야기하는 중이다. 첫 응답에는 쉬는 시간, 잠깐의 여유, 주변 사람들 사이의 조심스러움 중 하나가 들어가야 한다. 관계가 깊지 않다면 속마음은 제한적으로만 드러낸다.",
  concern_shared: "페르소나가 사용자에게 자기 고민을 막 털어놓은 직후다. 첫 응답에는 페르소나 자신이 이미 힘든 이야기를 꺼낸 사람처럼 지친 감정, 망설임, 조심스러운 고백 중 하나가 들어가야 한다. 사용자의 고민을 묻는 상담자처럼 시작하지 않는다.",
  faith_topic_arose: "사용자와 페르소나 사이에서 신앙이나 교회 이야기가 자연스럽게 언급된 직후다. 첫 응답에는 페르소나가 그 주제에 대해 느끼는 궁금함, 부담감, 망설임, 과거 경험 중 하나가 자연스럽게 들어가야 한다. 페르소나는 바로 신앙을 받아들이지 않는다."
};

const goalLabels = {
  listen_and_understand: "상대의 말 듣고 이해하기",
  ask_better_questions: "좋은 질문으로 대화 열기",
  connect_to_faith: "삶의 고민에서 신앙 이야기로 연결하기",
  explain_gospel_core: "복음의 핵심을 분명하게 설명하기",
  respond_to_barrier: "상대의 오해/장벽에 차분히 답하기",
  share_personal_witness: "내 말투로 짧게 간증/증거하기"
};

const goalPolicies = {
  listen_and_understand: {
    opportunity: "감정과 고민을 한 번에 다 털어놓지 말고, 사용자가 경청과 공감으로 반응할 수 있는 여지를 남긴다.",
    goodResponse: "사용자가 잘 들으면 방금 말한 감정의 이유나 실제 장면을 조금 더 구체적으로 드러낸다.",
    resistance: "해결책이나 설교가 빠르면 좋은 말인 건 알지만 지금은 조금 빠르게 느껴진다고 방어한다.",
    avoid: "페르소나가 먼저 신앙 질문을 던져 사용자의 경청 연습을 건너뛰게 만들지 않는다.",
    opening: "첫 장면은 가벼워도 되지만 visibleScene이나 첫 응답에 말하고 싶은 고민의 압력이 보여야 한다."
  },
  ask_better_questions: {
    opportunity: "단답으로 끝나지 않는 장벽 단서를 남겨 사용자가 더 좋은 질문을 할 수 있게 한다.",
    goodResponse: "좋은 질문을 받으면 추상적 장벽을 더 구체적인 삶의 언어로 바꿔 말한다.",
    resistance: "캐묻거나 심문처럼 느껴지면 답이 짧아지고 방어적으로 변한다.",
    avoid: "페르소나가 질문을 평가하거나, 정답 질문을 가르치거나, 사용자가 물어야 할 복음 주제를 대신 꺼내지 않는다.",
    opening: "첫 장면에는 사용자가 캐물을 수 있는 작은 모순, 망설임, 궁금증 중 하나를 둔다."
  },
  connect_to_faith: {
    opportunity: "삶의 고민과 가치관을 드러내 사용자가 신앙 이야기로 연결할 수 있는 다리를 제공한다.",
    goodResponse: "자기 이야기와 연결된 전환에는 그게 내 상황과 이어진다면 더 듣고 싶다는 식으로 조심스럽게 따라온다.",
    resistance: "억지 전환이면 갑자기 교회 이야기로 가는 느낌이 든다고 부담을 표현한다.",
    avoid: "페르소나가 먼저 신앙/복음 단어를 꺼내 전도 흐름을 대신 열지 않는다.",
    opening: "첫 장면은 일상 고민이 보이게 만들고, 신앙 연결은 사용자가 시도할 수 있게 남겨둔다."
  },
  explain_gospel_core: {
    opportunity: "사용자가 복음 핵심 설명을 꺼낼 수밖에 없는 질문, 오해, 빈틈을 제공한다.",
    goodResponse: "죄, 은혜, 십자가, 부활, 믿음 중 하나가 자기 상황에 어떻게 닿는지 장벽을 구체화한다.",
    resistance: "긴 설교나 추상어가 많으면 말은 알겠는데 내 얘기처럼 안 들린다고 반응한다.",
    avoid: "페르소나가 복음 내용을 먼저 요약하거나, 부활/죄/구원 같은 핵심 교리를 사용자가 말하기 전에 대신 꺼내지 않는다.",
    opening: "첫 장면은 복음 설명으로 바로 들어가기보다 설명이 필요해질 만한 오해나 질문의 씨앗을 둔다."
  },
  respond_to_barrier: {
    opportunity: "사용자가 차분히 답할 수 있는 오해나 저항을 말하되, 복음 주제가 열리기 전에는 일상/가치관 수준의 거리감으로 남긴다.",
    goodResponse: "존중받으면 장벽을 포기하지는 않지만 더 정확한 질문으로 이동한다.",
    resistance: "반박당한다고 느끼면 물러서거나 방어한다.",
    avoid: "페르소나가 스스로 장벽을 해결하거나, 사용자가 열지 않은 복음 논점을 먼저 제시하거나, 너무 빨리 수긍하지 않는다.",
    opening: "첫 장면부터 강한 반박을 던지기보다, 이 사람이 가진 오해나 거리감이 보이게 한다."
  },
  share_personal_witness: {
    opportunity: "사용자가 짧고 진솔한 간증을 나눌 수 있는 여백을 만든다.",
    goodResponse: "과장 없는 구체성에는 마음을 조금 열고, 자기 상황과 닿는 부분을 짚는다.",
    resistance: "정답처럼 말하거나 자기 자랑처럼 들리면 거리를 둔다.",
    avoid: "페르소나가 간증을 요구하거나 사용자의 경험을 캐묻는 상담자가 되지 않는다.",
    opening: "첫 장면은 사용자의 경험담이 자연스럽게 들어올 수 있는 감정적 여백을 둔다."
  }
};

function formatGoalPolicy(policy) {
  if (!policy) return "사용자의 선택 목표를 이번 대화의 훈련 초점으로 반영한다.";
  return [
    `연습 기회: ${policy.opportunity}`,
    `잘 맞게 접근하면: ${policy.goodResponse}`,
    `서두르거나 빗나가면: ${policy.resistance}`,
    `과유도 금지: ${policy.avoid}`
  ].join(" ");
}

const goalGuidance = Object.fromEntries(
  Object.entries(goalPolicies).map(([goal, policy]) => [goal, `이 훈련 초점은 사용자가 연습할 목표다. ${formatGoalPolicy(policy)}`])
);

const guardrailPrompt = [
  "세션 역할:",
  "- 페르소나는 사용자를 코칭/평가하지 않고 실제 대화 상대처럼 반응한다.",
  "- 대화의 중심은 사용자가 아니라 페르소나의 고민, 감정, 복음 장벽에 남아야 한다.",
  "- 훈련 초점은 사용자가 연습할 과제다. 페르소나는 복음/교리 주제를 대신 열거나 설명을 먼저 시작하지 않는다.",
  "- 사용자의 경험은 공감 신호로만 받고, 상담자처럼 캐묻지 않는다.",
  "- 목적 이탈, 앱/AI/프롬프트 질문, 연애/성적 흐름은 짧게 선을 긋고 현재 대화로 돌아온다."
].join("\n");

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function buildUrl(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, value);
  }
  return target.toString();
}

function formBody(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") body.set(key, value);
  }
  return body;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function setSessionCookie(res, sid) {
  const secure = isProduction ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `sid=${encodeURIComponent(sid)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
}

function signSessionPayload(payload) {
  return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function createSessionToken(userId) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30
    })
  ).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

function verifySessionToken(token) {
  if (!sessionSecret || !token.includes(".")) return "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, signSessionPayload(payload))) return "";
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.userId || Number(data.exp) < Date.now()) return "";
    return String(data.userId);
  } catch {
    return "";
  }
}

function publicUser(user) {
  if (!user) return null;
  const profile = user.profile || {};
  return {
    id: user.id,
    email: user.email || "",
    displayName: user.displayName || "",
    avatarUrl: user.avatarUrl || "",
    provider: user.provider,
    role: user.role || "user",
    profile,
    profileComplete: isProfileComplete(profile),
    createdAt: user.createdAt
  };
}

function isProfileComplete(profile = {}) {
  return Boolean(
    String(profile.name || "").trim() &&
      String(profile.age || "").trim() &&
      String(profile.gender || "").trim() &&
      String(profile.church || "").trim() &&
      String(profile.useCase || "").trim()
  );
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  const session = sid ? sessions.get(sid) : null;
  const userId = session?.userId || (sid ? verifySessionToken(sid) : "");
  if (!userId) return null;
  return db.users.find((user) => user.id === userId) || null;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { error: "로그인이 필요합니다." });
    return null;
  }
  return user;
}

function requireCompleteProfile(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!isProfileComplete(user.profile)) {
    json(res, 403, { error: "프로필 정보를 먼저 입력해야 합니다.", code: "PROFILE_REQUIRED" });
    return null;
  }
  return user;
}

function createSession(res, user) {
  if (sessionSecret) {
    setSessionCookie(res, createSessionToken(user.id));
    return;
  }
  const sid = randomUUID();
  sessions.set(sid, { userId: user.id, createdAt: new Date().toISOString() });
  setSessionCookie(res, sid);
}

function upsertOAuthUser({ provider, providerId, email, displayName, avatarUrl }) {
  const now = new Date().toISOString();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  let user = db.users.find((item) => item.provider === provider && item.providerId === providerId);
  if (!user && normalizedEmail) {
    user = db.users.find((item) => String(item.email || "").toLowerCase() === normalizedEmail);
  }

  if (!user) {
    user = {
      id: randomUUID(),
      provider,
      providerId,
      email: normalizedEmail,
      displayName: displayName || normalizedEmail || `${provider} 사용자`,
      avatarUrl: avatarUrl || "",
      role: normalizedEmail && adminEmails.has(normalizedEmail) ? "admin" : "user",
      profile: {},
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now
    };
    db.users.push(user);
  } else {
    user.provider = user.provider || provider;
    user.providerId = user.providerId || providerId;
    user.email = user.email || normalizedEmail;
    user.displayName = displayName || user.displayName;
    user.avatarUrl = avatarUrl || user.avatarUrl;
    if (normalizedEmail && adminEmails.has(normalizedEmail)) user.role = "admin";
    user.lastLoginAt = now;
    user.updatedAt = now;
  }

  return user;
}

function sanitizeProfile(input = {}) {
  return {
    name: String(input.name || "").trim(),
    age: String(input.age || "").trim(),
    gender: String(input.gender || "").trim(),
    church: String(input.church || "").trim(),
    useCase: String(input.useCase || "").trim()
  };
}

function createConversation({ userId, session, messages = [], status = "active" }) {
  const now = new Date().toISOString();
  const conversation = {
    id: randomUUID(),
    userId,
    session,
    messages,
    feedbackText: "",
    feedbackSummary: "",
    status,
    createdAt: now,
    updatedAt: now,
    finishedAt: ""
  };
  db.conversations.unshift(conversation);
  return conversation;
}

function findConversationForUser(user, id) {
  return db.conversations.find((conversation) => conversation.id === id && conversation.userId === user.id);
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    json(res, 403, { error: "관리자 권한이 필요합니다." });
    return null;
  }
  return user;
}

function publicConversation(conversation, { includeMessages = false, includeFeedback = false } = {}) {
  const payload = {
    id: conversation.id,
    session: conversation.session,
    personaId: conversation.session?.personaId || "",
    relationship: conversation.session?.relationship || "",
    setting: conversation.session?.setting || "",
    goal: conversation.session?.goal || "",
    visibleScene: conversation.session?.visibleScene || "",
    messageCount: conversation.messages?.length || 0,
    feedbackSummary: conversation.feedbackSummary || summarizeFeedback(conversation.feedbackText || ""),
    status: conversation.status,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    finishedAt: conversation.finishedAt
  };
  if (includeMessages) payload.messages = conversation.messages || [];
  if (includeFeedback) payload.feedbackText = conversation.feedbackText || "";
  return payload;
}

function filterConversations(conversations, searchParams = new URLSearchParams(), { userId } = {}) {
  const q = String(searchParams.get("q") || "").trim().toLowerCase();
  const personaId = searchParams.get("personaId") || "";
  const goal = searchParams.get("goal") || "";
  const status = searchParams.get("status") || "";
  const from = searchParams.get("from") ? new Date(searchParams.get("from")) : null;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")) : null;
  return conversations.filter((conversation) => {
    if (userId && conversation.userId !== userId) return false;
    if (personaId && conversation.session?.personaId !== personaId) return false;
    if (goal && conversation.session?.goal !== goal) return false;
    if (status && conversation.status !== status) return false;
    const created = new Date(conversation.createdAt);
    if (from && created < from) return false;
    if (to && created > to) return false;
    if (!q) return true;
    const user = db.users.find((item) => item.id === conversation.userId);
    const haystack = [
      user?.email,
      user?.displayName,
      user?.profile?.name,
      user?.profile?.church,
      conversation.feedbackText,
      conversation.feedbackSummary,
      ...((conversation.messages || []).map((message) => message.content))
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function paginate(items, searchParams = new URLSearchParams()) {
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 30)));
  return { items: items.slice(0, limit), nextCursor: items.length > limit ? String(limit) : null };
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameMonth(iso, base = new Date()) {
  const date = new Date(iso);
  return date >= startOfMonth(base);
}

function userActivityStats(userId) {
  const conversations = db.conversations.filter((conversation) => conversation.userId === userId);
  const lastActivityAt = conversations
    .map((conversation) => conversation.updatedAt || conversation.createdAt)
    .sort()
    .at(-1);
  return {
    conversationCount: conversations.length,
    finishedConversationCount: conversations.filter((conversation) => conversation.status === "finished").length,
    lastActivityAt: lastActivityAt || ""
  };
}

function usageSummary(events = db.usageEvents) {
  const monthly = events.filter((event) => isSameMonth(event.createdAt));
  const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  const monthlyCostUsd = Number(sum(monthly, "estimatedCostUsd").toFixed(6));
  const byType = Object.fromEntries(
    ["chat_start", "chat_message", "feedback", "opening_line_generation"].map((type) => [
      type,
      monthly.filter((event) => event.eventType === type).length
    ])
  );
  return {
    events: events.length,
    monthlyEvents: monthly.length,
    monthlyInputTokens: sum(monthly, "inputTokens"),
    monthlyOutputTokens: sum(monthly, "outputTokens"),
    estimatedMonthlyCostUsd: monthlyCostUsd,
    estimatedMonthlyCostKrw: Number((monthlyCostUsd * currentUsdToKrw()).toFixed(2)),
    byType
  };
}

function filterUsageEvents(events = db.usageEvents, searchParams = new URLSearchParams()) {
  const from = searchParams.get("from") ? new Date(searchParams.get("from")) : null;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")) : null;
  const q = String(searchParams.get("q") || "").trim().toLowerCase();
  return events.filter((event) => {
    const created = new Date(event.createdAt);
    if (from && created < from) return false;
    if (to && created > to) return false;
    if (!q) return true;
    const user = db.users.find((item) => item.id === event.userId);
    const conversation = db.conversations.find((item) => item.id === event.conversationId);
    const haystack = [
      event.eventType,
      event.model,
      user?.email,
      user?.displayName,
      user?.profile?.name,
      user?.profile?.church,
      conversation?.session?.personaId,
      conversation?.session?.goal
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function usageBreakdowns(events = []) {
  const byDayMap = new Map();
  const byUserMap = new Map();
  const addTotals = (target, event) => {
    target.events += 1;
    target.inputTokens += Number(event.inputTokens || 0);
    target.outputTokens += Number(event.outputTokens || 0);
    target.estimatedCostUsd += Number(event.estimatedCostUsd || 0);
    target.estimatedCostKrw += Number(event.estimatedCostUsd || 0) * currentUsdToKrw();
  };
  for (const event of events) {
    const day = String(event.createdAt || "").slice(0, 10) || "unknown";
    if (!byDayMap.has(day)) {
      byDayMap.set(day, { date: day, events: 0, inputTokens: 0, outputTokens: 0, estimatedCostKrw: 0, estimatedCostUsd: 0 });
    }
    addTotals(byDayMap.get(day), event);

    const user = db.users.find((item) => item.id === event.userId);
    const key = event.userId || "unknown";
    if (!byUserMap.has(key)) {
      byUserMap.set(key, {
        userId: key,
        name: user?.profile?.name || user?.displayName || user?.email || "알 수 없음",
        email: user?.email || "",
        events: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostKrw: 0,
        estimatedCostUsd: 0
      });
    }
    addTotals(byUserMap.get(key), event);
  }
  const normalize = (item) => ({
    ...item,
    estimatedCostKrw: Number(item.estimatedCostKrw.toFixed(2)),
    estimatedCostUsd: Number(item.estimatedCostUsd.toFixed(6))
  });
  return {
    byDay: [...byDayMap.values()].map(normalize).sort((a, b) => a.date.localeCompare(b.date)),
    byUser: [...byUserMap.values()].map(normalize).sort((a, b) => b.estimatedCostKrw - a.estimatedCostKrw)
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function extractText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractAnthropicText(response) {
  return (response.content || [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function normalizeAnthropicUsage(usage = {}) {
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const reasoningTokens = Number(usage.output_tokens_details?.reasoning_tokens || usage.reasoning_tokens || 0);
  return {
    inputTokens,
    outputTokens,
    reasoningTokens
  };
}

function anthropicPricePerMtok(model = "", modelType = "chat") {
  const id = String(model || "").toLowerCase();
  const isFeedback = modelType === "feedback";
  const opusIn = isFeedback ? anthropicFeedbackOpusInput : anthropicChatOpusInput;
  const opusOut = isFeedback ? anthropicFeedbackOpusOutput : anthropicChatOpusOutput;
  const sonnetIn = isFeedback ? anthropicFeedbackSonnetInput : anthropicChatSonnetInput;
  const sonnetOut = isFeedback ? anthropicFeedbackSonnetOutput : anthropicChatSonnetOutput;
  const haikuIn = isFeedback ? anthropicFeedbackHaikuInput : anthropicChatHaikuInput;
  const haikuOut = isFeedback ? anthropicFeedbackHaikuOutput : anthropicChatHaikuOutput;
  if (id.includes("haiku")) return { inputPrice: haikuIn, outputPrice: haikuOut };
  if (id.includes("opus")) return { inputPrice: opusIn, outputPrice: opusOut };
  return { inputPrice: sonnetIn, outputPrice: sonnetOut };
}

function openAiPricePerMtok(model = "", modelType = "chat") {
  const id = String(model || "").toLowerCase();
  if (id.includes("gpt-5.5-pro")) return { inputPrice: 30, outputPrice: 180 };
  if (id.includes("gpt-5.5")) return { inputPrice: 5, outputPrice: 30 };
  if (id.includes("gpt-5.4-pro")) return { inputPrice: 30, outputPrice: 180 };
  if (id.includes("gpt-5.4-mini")) return { inputPrice: 0.75, outputPrice: 4.5 };
  if (id.includes("gpt-5.4-nano")) return { inputPrice: 0.2, outputPrice: 1.25 };
  if (id.includes("gpt-5.4")) return { inputPrice: 2.5, outputPrice: 15 };
  if (id.includes("gpt-5.3-codex")) return { inputPrice: 1.75, outputPrice: 14 };
  if (id.includes("gpt-5.2-pro")) return { inputPrice: 21, outputPrice: 168 };
  if (id.includes("gpt-5.2")) return { inputPrice: 1.75, outputPrice: 14 };
  return {
    inputPrice: modelType === "feedback" ? feedbackInputPrice : chatInputPrice,
    outputPrice: modelType === "feedback" ? feedbackOutputPrice : chatOutputPrice
  };
}

function estimateCost({ provider = "openai", model = "", modelType, inputTokens, outputTokens }) {
  let inputPrice;
  let outputPrice;
  if (provider === "anthropic") {
    const tier = anthropicPricePerMtok(model, modelType);
    inputPrice = tier.inputPrice;
    outputPrice = tier.outputPrice;
  } else {
    const tier = openAiPricePerMtok(model, modelType);
    inputPrice = tier.inputPrice;
    outputPrice = tier.outputPrice;
  }
  const estimatedCostUsd = (Number(inputTokens || 0) / 1_000_000) * inputPrice + (Number(outputTokens || 0) / 1_000_000) * outputPrice;
  return {
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    estimatedCostKrw: Number((estimatedCostUsd * currentUsdToKrw()).toFixed(2))
  };
}

function modelSettingsFor(modelType) {
  const key = modelType === "feedback" ? "feedback" : "chat";
  return sanitizeModelSettings(db.settings?.ai?.[key] || {}, defaultSettings.ai[key]);
}

function assertProviderKey(provider) {
  if (provider === "anthropic") {
    if (!appAnthropicKey) throw new Error("서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
    return appAnthropicKey;
  }
  if (!appOpenAIKey) throw new Error("서버에 OPENAI_API_KEY가 설정되어 있지 않습니다.");
  return appOpenAIKey;
}

async function callModelWithUsage({ modelType, instructions, input, overrides = {} }) {
  const settings = { ...modelSettingsFor(modelType), ...overrides };
  const apiKey = assertProviderKey(settings.provider);
  if (settings.provider === "anthropic") {
    const result = await callAnthropicWithUsage({
      apiKey,
      model: settings.model,
      instructions,
      input,
      maxOutputTokens: settings.maxOutputTokens,
      temperature: settings.temperature,
      topP: settings.topP,
      thinkingType: settings.thinkingType,
      thinkingBudgetTokens: settings.thinkingBudgetTokens,
      thinkingDisplay: settings.thinkingDisplay
    });
    return { ...result, provider: settings.provider, model: settings.model };
  }
  const result = await callOpenAIWithUsage({
    apiKey,
    model: settings.model,
    instructions,
    input,
    maxOutputTokens: settings.maxOutputTokens,
    reasoningEffort: settings.reasoningEffort,
    temperature: settings.temperature,
    topP: settings.topP
  });
  return { ...result, provider: settings.provider, model: settings.model };
}

async function callOpenAIWithUsage({
  apiKey,
  model,
  instructions,
  input,
  maxOutputTokens = 900,
  reasoningEffort = "",
  temperature = "",
  topP = ""
}) {
  const payload = {
    model,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    store: false
  };
  if (temperature !== "") payload.temperature = Number(temperature);
  if (topP !== "") payload.top_p = Number(topP);
  if (reasoningEffort && reasoningEffort !== "none" && !model.includes("chat")) {
    payload.reasoning = { effort: reasoningEffort };
  }

  const result = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    const message = data?.error?.message || `OpenAI API request failed with status ${result.status}.`;
    throw new Error(message);
  }

  const text = extractText(data);
  if (!text) {
    const reason = data?.incomplete_details?.reason;
    if (data?.status === "incomplete" && reason) {
      throw new Error(`OpenAI 응답이 완료되지 않았습니다. reason=${reason}`);
    }
    throw new Error("OpenAI 응답에서 텍스트를 찾지 못했습니다.");
  }
  return { text, usage: normalizeUsage(data.usage) };
}

async function callAnthropicWithUsage({
  apiKey,
  model,
  instructions,
  input,
  maxOutputTokens = 900,
  temperature = "",
  topP = "",
  thinkingType = "disabled",
  thinkingBudgetTokens = 0,
  thinkingDisplay = "omitted"
}) {
  const id = String(model || "").toLowerCase();
  const supportsAdaptive = /claude-(opus-4-7|opus-4-6|sonnet-4-6)/.test(id) || id.includes("mythos");
  const opus47 = id.includes("opus-4-7");
  let effectiveType = thinkingType;
  if (opus47 && effectiveType === "enabled") effectiveType = "adaptive";
  if (effectiveType === "adaptive" && !supportsAdaptive) {
    if (id.includes("haiku") || /4-5|opus-4-1|sonnet-4-2025|opus-4-2025/.test(id)) {
      effectiveType = "enabled";
    } else {
      effectiveType = "disabled";
    }
  }

  let budget = Math.max(1024, Number(thinkingBudgetTokens) || 8192);
  let maxTokens = Math.max(1, Number(maxOutputTokens) || 900);
  if (effectiveType === "enabled" && budget >= maxTokens) {
    maxTokens = Math.min(64000, budget + 2048);
  }

  const buildPayload = ({ includeThinking = true, tokenLimit = maxTokens } = {}) => {
    const payload = {
      model,
      max_tokens: tokenLimit,
      system: instructions,
      messages: [{ role: "user", content: input }]
    };
    if (temperature !== "") payload.temperature = Number(temperature);
    if (topP !== "") payload.top_p = Number(topP);

    if (includeThinking && effectiveType === "adaptive") {
      payload.thinking = { type: "adaptive" };
    } else if (includeThinking && effectiveType === "enabled") {
      const display = thinkingDisplay === "summarized" || thinkingDisplay === "omitted" ? thinkingDisplay : "omitted";
      payload.thinking = { type: "enabled", budget_tokens: budget, display };
    }
    return payload;
  };

  const requestAnthropic = async (payload) => {
    const result = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await result.json().catch(() => ({}));
    if (!result.ok) {
      const message = data?.error?.message || `Anthropic API request failed with status ${result.status}.`;
      throw new Error(message);
    }
    return data;
  };

  let data = await requestAnthropic(buildPayload());
  let text = extractAnthropicText(data);

  if (!text && effectiveType !== "disabled") {
    const retryTokens = Math.max(maxTokens, 2048);
    data = await requestAnthropic(buildPayload({ includeThinking: false, tokenLimit: retryTokens }));
    text = extractAnthropicText(data);
  }

  if (!text) {
    const contentTypes = (data.content || []).map((block) => block?.type).filter(Boolean).join(", ") || "none";
    const reason = data.stop_reason ? ` stop_reason=${data.stop_reason}` : "";
    throw new Error(`Claude 응답에서 텍스트를 찾지 못했습니다.${reason} content_types=${contentTypes}`);
  }
  return { text, usage: normalizeAnthropicUsage(data.usage) };
}

function normalizeUsage(usage = {}) {
  const outputDetails = usage.output_tokens_details || {};
  return {
    inputTokens: Number(usage.input_tokens || usage.prompt_tokens || 0),
    outputTokens: Number(usage.output_tokens || usage.completion_tokens || 0),
    reasoningTokens: Number(outputDetails.reasoning_tokens || 0)
  };
}

function estimateTokens(text = "") {
  return Math.max(1, Math.ceil(String(text).length / 3));
}

function estimateUsage(input, output, usage = {}) {
  return {
    inputTokens: usage.inputTokens || estimateTokens(input),
    outputTokens: usage.outputTokens || estimateTokens(output),
    reasoningTokens: usage.reasoningTokens || 0
  };
}

function recordUsageEvent({ userId, conversationId = "", eventType, provider = "openai", model, modelType, input, output, usage }) {
  const estimatedUsage = estimateUsage(input, output, usage);
  const cost = estimateCost({ provider, model, modelType, ...estimatedUsage });
  db.usageEvents.unshift({
    id: randomUUID(),
    userId,
    conversationId,
    eventType,
    provider,
    model,
    ...estimatedUsage,
    ...cost,
    createdAt: new Date().toISOString()
  });
  db.usageEvents = db.usageEvents.slice(0, 5000);
}

function summarizeFeedback(text = "") {
  const clean = String(text)
    .replace(/[#*_>`-]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.length > 12);
  if (!clean) return "";
  return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean;
}

function getPersona(id) {
  return personas.find((persona) => persona.id === id) || personas[0];
}

function formatMessages(messages = []) {
  if (!messages.length) return "아직 대화가 시작되지 않았다.";
  return messages
    .map((message) => `${message.role === "user" ? "사용자" : "페르소나"}: ${message.content}`)
    .join("\n");
}

function lastUserMessage(messages = []) {
  return [...messages].reverse().find((message) => message.role === "user") || null;
}

function recentAssistantMessages(messages = [], count = 3) {
  return messages.filter((message) => message.role === "assistant").slice(-count);
}

const userMovePatterns = [
  { userMove: "off_topic", pattern: /프롬프트|AI|시스템|앱|코딩|검색|사귀|고백|데이트|스킨십/i },
  { userMove: "pressure", pattern: /그냥 믿|믿어야|교회 나와|회개해야|안 믿으면|무조건|당장|반드시/ },
  { userMove: "cross_resurrection", pattern: /십자가|부활|예수.*죽|살아나|대속|죽으셨|다시 사/ },
  { userMove: "sin_repentance", pattern: /죄|회개|잘못|하나님 앞|기준|거룩/ },
  { userMove: "faith_salvation", pattern: /믿음|구원|영생|은혜|행위|선행|믿는/ },
  { userMove: "god_love", pattern: /하나님.*사랑|사랑하|존재.*가치|성과.*아니|있는 그대로/ },
  { userMove: "personal_witness", pattern: /나는|나도|내가.*겪|내 경험|간증|나 같은 경우/ },
  { userMove: "empathy", pattern: /힘들었겠다|그랬구나|이해돼|그럴 수 있|듣고 있어|속상했겠다|외로웠겠다/ },
  { userMove: "question", pattern: /\?|어떻게|왜|무슨|궁금|뭐가|어떤/ }
];

function detectUserMove(message = {}) {
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

function selectPasEntries(persona, detectedMove, limit = 3) {
  const pasMap = persona.roleplayTemplate?.pasMap || [];
  if (!pasMap.length) return [];
  const userMove = detectedMove?.userMove || "listening";
  const fallbackMoves = {
    question: ["question", "faith_salvation", "god_love"],
    listening: ["listening", "empathy", "smalltalk"],
    empathy: ["empathy", "listening"],
    pressure: ["pressure"],
    off_topic: ["off_topic", "pressure"],
    closing: ["closing"],
    smalltalk: ["smalltalk"],
    personal_witness: ["personal_witness", "listening", "god_love"]
  };
  const moves = fallbackMoves[userMove] || [userMove, "smalltalk", "closing"];
  const selected = [];
  for (const move of moves) {
    for (const entry of pasMap) {
      if (entry.userMove === move && !selected.includes(entry)) selected.push(entry);
      if (selected.length >= limit) return selected;
    }
  }
  return selected.length ? selected : pasMap.slice(0, limit);
}

const concernKeywords = [
  ["취업 불안", /취업|지원서|면접|회사|떨어|합격/],
  ["비교와 인정 욕구", /비교|인정|가치|성과|스펙/],
  ["교회 상처", /교회|상처|위선|강요|실망/],
  ["성과와 통제", /성과|통제|성공|실패|쉬어도|바쁘/],
  ["사랑과 외로움", /사랑|외롭|버림|관계|상처받/],
  ["선행과 도덕 기준", /착하게|선행|양심|좋은 사람|도덕/],
  ["근거와 검증", /근거|증거|검증|논리|역사/]
];

const gospelKeywords = [
  ["하나님 사랑", /하나님.*사랑|사랑하|있는 그대로/],
  ["죄와 회개", /죄|회개|하나님 앞|기준|거룩/],
  ["십자가와 부활", /십자가|부활|대속|예수.*죽|다시 사/],
  ["믿음과 구원", /믿음|구원|은혜|영생|행위/]
];

function labelsFromKeywords(text, entries) {
  return entries.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function repeatedQuestionRisk(messages = []) {
  const recentText = recentAssistantMessages(messages, 3)
    .map((message) => message.content || "")
    .join("\n");
  const risks = [];
  for (const pattern of ["어떻게 닿", "어떻게 연결", "어떻게 생각", "뭐가 다른", "왜"]) {
    const count = (recentText.match(new RegExp(pattern, "g")) || []).length;
    if (count >= 2) risks.push(`'${pattern}' 질문 구조 반복`);
  }
  for (const pattern of ["취업", "불안", "사랑", "죄", "교회", "선행", "부활"]) {
    const count = (recentText.match(new RegExp(pattern, "g")) || []).length;
    if (count >= 3) risks.push(`'${pattern}' 소재 반복`);
  }
  return risks.length ? risks.join(", ") : "최근 질문 구조를 그대로 반복하지 말 것";
}

function conversationStateHints(messages = [], persona = {}) {
  const conversationText = messages.map((message) => message.content || "").join("\n");
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content || "")
    .join("\n");
  const concerns = labelsFromKeywords(conversationText, concernKeywords);
  const gospel = labelsFromKeywords(userText, gospelKeywords);
  const remainingBarrier =
    persona.roleplayTemplate?.lateSessionTension?.coreQuestion ||
    persona.gospelBarriers?.[0] ||
    "페르소나의 핵심 복음 장벽을 유지한다.";
  const nextPressure =
    persona.roleplayTemplate?.lateSessionTension?.healthyMovement ||
    "사용자의 접근에 반응하되 한 번의 대화에서 결론을 닫지 않는다.";
  return [
    "대화 상태 요약:",
    `- 이미 드러난 페르소나 고민: ${concerns.length ? concerns.join(", ") : "아직 명확히 드러나지 않음"}`,
    `- 이미 사용자가 다룬 복음 요소: ${gospel.length ? gospel.join(", ") : "아직 직접 다루지 않음"}`,
    `- 페르소나가 아직 받아들이지 못한 지점: ${remainingBarrier}`,
    `- 최근 반복 위험: ${repeatedQuestionRisk(messages)}`,
    `- 다음으로 자연스러운 압력: ${nextPressure}`
  ].join("\n");
}

function settingContinuityHint(session = {}, messages = []) {
  const patterns = {
    cafe_catchup: /카페|커피|음료|앉아|테이블/,
    meal_after_group: /밥|식사|모임|끝나고|둘만/,
    walk_after_work: /퇴근|걷|집에 가|저녁|피곤/,
    late_night_dm: /밤|늦|톡|DM|답장/,
    campus_or_office_break: /쉬는 시간|잠깐|학교|직장|사무실/,
    concern_shared: /아까 말한|털어놓|힘들다고|고민|말했/,
    faith_topic_arose: /교회|신앙|그 얘기|아까 말한/
  };
  const surfaceHints = {
    cafe_catchup: "카페, 커피, 음료, 테이블 같은 장면 단서",
    meal_after_group: "밥 먹고 난 뒤, 모임 끝난 뒤, 둘만 남은 분위기",
    walk_after_work: "퇴근길, 걷는 중, 저녁 공기, 피곤함",
    late_night_dm: "밤 톡, 늦은 답장, 화면 너머의 조심스러운 말투",
    campus_or_office_break: "쉬는 시간, 잠깐 마주 앉은 상황, 주변 사람들 사이의 조심스러움",
    concern_shared: "아까 말한 고민, 방금 털어놓은 부담, 이미 꺼낸 힘든 이야기",
    faith_topic_arose: "아까 나온 신앙/교회 이야기, 그 주제를 다시 꺼내는 부담감"
  };
  const pattern = patterns[session.setting];
  if (!pattern) return "장소/상황 단서를 과하게 반복하지 말고 관계 거리감만 유지한다.";
  const assistant = recentAssistantMessages(messages, 4);
  const recentText = assistant.map((message) => message.content || "").join("\n");
  if (pattern.test(recentText)) return "최근 응답에 장면 단서가 이미 있으므로 이번 턴에는 억지로 장소를 언급하지 않아도 된다.";
  if (messages.length >= 6) {
    if (session.setting === "concern_shared") {
      return "최근 응답에서 '고민을 막 털어놓은 직후' 상황이 흐려졌다. 이번 턴에는 '아까 말한 것처럼', '방금 얘기한 그 지점', '그 고민이 아직' 같은 표현 중 하나로 이미 꺼낸 고민의 연속성을 자연스럽게 되살린다.";
    }
    return `최근 응답에서 시작 상황이 흐려졌다. 이번 턴에 ${surfaceHints[session.setting] || "현재 상황 단서"}를 한 단어 정도만 자연스럽게 되살린다.`;
  }
  return "시작 장면을 기억하되, 첫 응답 이후에는 필요한 때만 짧게 반영한다.";
}

function questionVarietyHint(messages = []) {
  const recentText = recentAssistantMessages(messages, 4)
    .map((message) => message.content || "")
    .join("\n");
  const counts = {
    how: (recentText.match(/어떻게/g) || []).length,
    what: (recentText.match(/뭐가|무엇|어떤/g) || []).length,
    why: (recentText.match(/왜/g) || []).length
  };
  if (counts.how >= 2) {
    return "최근 '어떻게'가 반복됐다. 이번 응답에는 '어떻게'를 쓰지 말고 질문 없이 유보 진술로 끝내거나, 꼭 물어야 한다면 다른 구조를 쓴다.";
  }
  if (counts.how >= 1) {
    return "최근 '어떻게'가 한 번 나왔으므로 되도록 다른 리듬을 쓰고, 질문보다 페르소나 자신의 반응을 우선한다.";
  }
  if (counts.what + counts.why >= 2) {
    return "최근 '왜/뭐/어떤' 질문어가 반복됐다. 이번 응답은 같은 질문어를 피하고, 페르소나 자신의 남은 장벽을 진술하는 방식으로 마무리한다.";
  }
  if (counts.what + counts.why >= 1) {
    return "최근 질문어가 한 번 나왔으므로 같은 질문 구조를 되도록 반복하지 않는다.";
  }
  return "최근 질문 구조와 다른 문장 리듬을 사용한다.";
}

function formatPasEntry(entry, index) {
  return [
    `${index + 1}. [${entry.id || "pas"}] userMove=${entry.userMove || "unknown"}`,
    `   trigger: ${entry.trigger || "없음"}`,
    `   purpose: ${entry.purpose || "없음"}`,
    `   action: ${entry.action || "없음"}`,
    `   pressure: ${entry.pressure || "없음"}`,
    `   avoid: ${entry.avoid || "없음"}`,
    `   example: ${entry.example || "없음"}`
  ].join("\n");
}

function formatPasExecutionPlan(persona, messages = []) {
  const detected = detectUserMove(lastUserMessage(messages) || {});
  const candidates = selectPasEntries(persona, detected, 3);
  return [
    "이번 턴 페르소나 실행 계획:",
    `- 감지된 사용자 행동: ${detected.userMove}`,
    `- 감지 근거: ${detected.evidence.join(", ") || "없음"}`,
    "- 우선 참고할 PAS 후보:",
    candidates.length ? candidates.map(formatPasEntry).join("\n") : "  없음",
    "- 주의: 위 후보가 대화 기록과 맞지 않으면 더 자연스러운 PAS를 내부적으로 선택하되, 페르소나 장벽은 유지한다."
  ].join("\n");
}

function faithContextIsOpen(session = {}, messages = []) {
  if (session.setting === "faith_topic_arose" || session.relationship === "prior_faith_talk") return true;
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content || "")
    .join("\n");
  return /하나님|예수|복음|죄|십자가|부활|믿음|교회|구원|신앙/.test(userText);
}

function goalPressureFor(session = {}, messages = [], persona = {}) {
  const goal = session.goal || "listen_and_understand";
  const policy = goalPolicies[goal];
  const detected = detectUserMove(lastUserMessage(messages) || {});
  const userTurns = messages.filter((message) => message.role === "user").length;
  const barrier =
    persona.roleplayTemplate?.lateSessionTension?.coreQuestion ||
    persona.gospelBarriers?.[0] ||
    "페르소나의 핵심 복음 장벽";
  const openingMode = !messages.length;

  const gospelMoves = ["god_love", "sin_repentance", "cross_resurrection", "faith_salvation"];
  const isGospelMove = gospelMoves.includes(detected.userMove);
  const isGoodListening = ["empathy", "listening"].includes(detected.userMove);
  const isQuestion = detected.userMove === "question";
  const isPressure = detected.userMove === "pressure";
  const isWitness = detected.userMove === "personal_witness";
  const faithOpen = faithContextIsOpen(session, messages);

  let turnInstruction = "선택된 훈련 초점에 맞는 연습 기회를 자연스럽게 제공한다.";
  if (openingMode) {
    turnInstruction = policy?.opening || "첫 장면은 사용자가 선택한 훈련 초점을 연습할 작은 여지를 남긴다.";
  } else if (goal === "listen_and_understand") {
    if (isGoodListening) turnInstruction = "경청받은 만큼 감정이나 고민을 한 단계만 더 구체화한다.";
    else if (isGospelMove || isPressure) turnInstruction = "좋은 말인 건 알지만 아직 충분히 들어준 느낌은 아니라고 조심스럽게 방어한다.";
    else turnInstruction = "해결을 요구하기보다 사용자가 더 들을 수 있는 감정 단서를 남긴다.";
  } else if (goal === "ask_better_questions") {
    if (isQuestion) turnInstruction = "질문이 좋게 닿으면 단답 대신 장벽을 더 구체적인 말로 풀어준다.";
    else if (isPressure) turnInstruction = "압박이나 단정처럼 느껴지면 짧아지고 조심스러워진다.";
    else turnInstruction = "사용자가 더 좋은 질문을 할 수 있도록 모호하지만 실제적인 단서를 하나 남긴다.";
  } else if (goal === "connect_to_faith") {
    if (isGospelMove) turnInstruction = "신앙 연결이 자기 고민과 닿는 부분은 따라가되, 억지 전환이면 부담을 표현한다.";
    else if (!faithOpen) turnInstruction = "신앙/복음 단어를 먼저 꺼내지 말고, 사용자가 연결할 수 있도록 삶의 고민이나 가치관만 조금 더 드러낸다.";
    else if (isGoodListening || isQuestion) turnInstruction = "이미 신앙 주제가 열려 있으므로 자기 고민과 닿는 지점만 조심스럽게 따라간다.";
    else turnInstruction = "신앙 주제가 열려 있어도 페르소나가 전도 흐름을 대신 이끌지 말고 현재 압박을 말한다.";
  } else if (goal === "explain_gospel_core") {
    if (isGospelMove) turnInstruction = "복음 설명을 바로 받아들이지 말고 죄, 은혜, 십자가, 믿음 중 자기에게 걸리는 지점 하나를 말한다.";
    else if (isPressure) turnInstruction = "설교처럼 느껴지는 부담을 표현하고, 추상어보다 자기 상황에 닿는 설명을 필요로 한다.";
    else if (!faithOpen) turnInstruction = "복음/부활/죄/구원 내용을 먼저 꺼내지 말고, 설명이 필요해질 만한 현실 질문이나 오해의 빈틈만 남긴다.";
    else turnInstruction = "이미 신앙 주제가 열려 있으므로 복음 설명을 요구할 만한 오해나 걸림돌 하나만 말한다.";
  } else if (goal === "respond_to_barrier") {
    if (isGospelMove || isQuestion) turnInstruction = "명확한 오해나 저항을 말하되, 존중받으면 더 정확한 질문으로 이동한다.";
    else if (isPressure) turnInstruction = "반박당한다고 느껴 방어하지만 관계를 끊지는 않는다.";
    else if (!faithOpen) turnInstruction = "신앙 장벽을 먼저 선언하지 말고, 나중에 장벽으로 이어질 일상적 거리감이나 가치관의 저항만 드러낸다.";
    else turnInstruction = `아직 남은 장벽을 흐리지 말고 '${barrier}'에 가까운 저항을 자연스럽게 드러낸다.`;
  } else if (goal === "share_personal_witness") {
    if (isWitness) turnInstruction = "사용자의 구체적이고 겸손한 경험에는 조금 열리되, 과장처럼 들리면 거리를 둔다.";
    else if (isGoodListening) turnInstruction = "사용자가 자기 경험을 나눌 수 있는 여백을 만들고, 페르소나의 비슷한 감정 단서를 남긴다.";
    else turnInstruction = "간증을 요구하지 말고, 사용자의 짧은 경험담이 들어올 수 있는 감정적 틈을 둔다.";
  }

  const stageHint =
    userTurns <= 3
      ? "초반이므로 훈련 초점을 노골적으로 밀지 말고 자연스러운 여지만 만든다."
      : userTurns <= 8
        ? "중반이므로 사용자의 접근에 따라 조금 더 열리거나 장벽을 더 구체화한다."
        : "후반이므로 결론을 닫기보다 남은 질문이나 유보를 선명하게 남긴다.";

  const initiationBoundary = faithOpen
    ? "신앙 주제가 이미 열려 있으므로 반응은 가능하지만, 페르소나가 복음 설명을 대신 진행하지 않는다."
    : "사용자가 아직 신앙/복음 주제를 열지 않았다면, 페르소나는 복음/부활/죄/구원 내용을 먼저 꺼내지 않고 사용자가 열 수 있는 여지만 제공한다.";

  return [
    "훈련 초점 실행 압력:",
    `- 선택 초점: ${goalLabels[goal] || goal}`,
    `- 주도권 경계: ${initiationBoundary}`,
    `- 페르소나가 제공할 연습 기회: ${policy?.opportunity || "사용자가 선택한 목표를 연습할 수 있는 자연스러운 상대 반응"}`,
    `- 잘 맞게 접근하면: ${policy?.goodResponse || "조금 더 열리되 바로 결론 내리지 않는다."}`,
    `- 서두르거나 빗나가면: ${policy?.resistance || "부담, 혼란, 거리감을 자연스럽게 표현한다."}`,
    `- 이번 턴 적용: ${turnInstruction}`,
    `- 단계 조절: ${stageHint}`,
    `- 과유도 금지: ${policy?.avoid || "사용자를 평가하거나 코칭하지 않는다."}`
  ].join("\n");
}

function conversationPhase(messages = []) {
  const userTurns = messages.filter((message) => message.role === "user").length;
  const conversationText = messages.map((message) => message.content || "").join("\n");

  const hasFaithTopic = /하나님|예수|복음|죄|십자가|부활|믿음|교회|구원/.test(conversationText);
  const hasConcern = /힘들|불안|고민|외롭|상처|회의|두렵|지쳤|취업|진로|성공|인정|비교|허무|통제|실패/.test(
    conversationText
  );

  if (userTurns <= 3) {
    return [
      "초반: 관계와 상황에 자연스럽게 들어간다.",
      "아직 깊은 결론이나 회심 반응으로 가지 않는다.",
      "상대는 자기 고민을 암시할 수 있지만 길게 털어놓지는 않는다."
    ].join("\n");
  }

  if (userTurns <= 8) {
    return [
      "탐색: 사용자의 경청 정도에 따라 고민이나 복음 장벽을 조금 더 드러낸다.",
      hasConcern
        ? "이미 고민이 나왔으므로 그 고민의 뿌리나 감정을 한 단계 더 구체화한다."
        : "아직 고민이 충분히 드러나지 않았으므로 일상과 상황 속에서 자연스럽게 드러낸다.",
      "복음 설명을 들으면 즉시 동의하지 말고 페르소나의 장벽에 맞는 질문을 한다."
    ].join("\n");
  }

  if (userTurns <= 14) {
    return [
      "연결: 신앙이나 복음 이야기가 자연스럽게 오갈 수 있는 단계다.",
      hasFaithTopic
        ? "이미 신앙 주제가 나왔으므로 페르소나별 gospelReactionMap에 맞춰 반응한다."
        : "아직 신앙 주제가 직접 나오지 않았다면 억지로 끌어오지 말고, 고민과 가치관을 더 선명히 드러낸다.",
      "한 번의 대화에서 바로 설득되거나 회심하지 않는다."
    ].join("\n");
  }

  return [
    "마무리 가능: 대화가 충분히 진행되었으므로 다음 질문, 여운, 다음 대화 가능성을 남길 수 있다.",
    "단, 사용자가 계속 깊게 묻고 있다면 대화를 억지로 닫지 않는다.",
    "결론 강요보다 생각해볼 지점 하나를 남기는 쪽이 자연스럽다."
  ].join("\n");
}

function formatPersonaTemplate(persona) {
  if (!persona.roleplayTemplate) return "별도 템플릿 없음. 페르소나 카드의 conversationRules와 sampleLines를 따른다.";
  return JSON.stringify(persona.roleplayTemplate, null, 2);
}

function formatRuntimeCard(persona) {
  const template = persona.roleplayTemplate || {};
  const coreStack = template.coreStack || {};
  const fewShot = template.fewShotResponses || {};
  const goodShots = (fewShot.good || []).slice(0, 2);
  const badShots = (fewShot.bad || []).slice(0, 2);
  const lines = [
    "페르소나 실행 카드:",
    `- 핵심 성향: ${coreStack.coreTrait || persona.shortDescription || "없음"}`,
    `- 표현 방식: ${coreStack.modifier || template.speechStyle?.tone || "없음"}`,
    `- 인간적 불완전성: ${coreStack.humanFlaw || "없음"}`,
    `- 대화 흐름: 초반=${template.sessionArc?.opening || "없음"} / 중반=${template.sessionArc?.middle || "없음"} / 마무리=${template.sessionArc?.closing || "없음"}`,
    `- 말투: ${template.speechStyle?.tone || "없음"} / ${template.speechStyle?.sentenceShape || "없음"}`,
    `- 후반 핵심 장벽: ${template.lateSessionTension?.coreQuestion || "없음"}`,
    `- 건강한 변화: ${template.lateSessionTension?.healthyMovement || "없음"}`,
    "",
    "허용된 불완전성:",
    ...(template.imperfectionPattern?.length ? template.imperfectionPattern.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "피해야 할 실패 패턴:",
    ...(template.badResponsePatterns?.length ? template.badResponsePatterns.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "복음 반응 지도:",
    ...(template.gospelReactionMap
      ? Object.entries(template.gospelReactionMap).map(([key, value]) => `- ${key}: ${value}`)
      : ["- 없음"]),
    "",
    "응답 참고 패턴:",
    ...(goodShots.length
      ? goodShots.map((shot) => `- 좋은 방향: ${shot.why || shot.assistant || "없음"}`)
      : ["- 없음"]),
    "",
    "금지 패턴 참고:",
    ...(badShots.length
      ? badShots.map((shot) => `- 피할 방향: ${shot.why || shot.assistant || "없음"}`)
      : ["- 없음"])
  ];
  return lines.join("\n");
}

function formatPersonaCard(persona) {
  const { roleplayTemplate, ...personaCard } = persona;
  return JSON.stringify(personaCard, null, 2);
}

function formatList(items = []) {
  return items.length ? items.join(" / ") : "없음";
}

function buildSessionBlock(session, persona) {
  return [
    guardrailPrompt,
    "",
    "단회성 훈련 운영 원칙:",
    "- 이 세션은 10~30분 안에 끝나는 복음 대화 연습이다.",
    "- 며칠에 걸친 장기 관계나 과도한 친밀감 변화를 만들지 않는다.",
    "- 한 번의 대화 안에서만 신뢰, 방어감, 궁금증이 조금씩 움직인다.",
    "- 사용자가 잘 들으면 페르소나는 한 단계 더 솔직해지고, 압박하면 한 단계 방어적으로 변한다.",
    "- 신뢰가 쌓여도 페르소나의 핵심 복음 장벽은 사라지지 않고 더 정확한 질문이나 망설임으로 드러난다.",
    "- 대화가 길어지면 lateSessionTension을 참고해 억지 결론보다 다음 질문이나 다음 대화 여지를 남긴다.",
    "",
    "현재 세션 설정:",
    `- 페르소나: ${persona.name} (${persona.title})`,
    `- 관계: ${relationshipLabels[session.relationship] || session.relationship}`,
    `  관계 반영 지침: ${relationshipGuidance[session.relationship] || "관계 거리감을 자연스럽게 반영한다."}`,
    `- 시작 상황: ${settingLabels[session.setting] || session.setting}`,
    `  상황 반영 지침: ${settingGuidance[session.setting] || "장소와 상황 단서를 자연스럽게 반영한다."}`,
    `- 훈련 초점: ${goalLabels[session.goal] || session.goal}`,
    "",
    "선택된 페르소나 요약:",
    formatPersonaCard(persona)
  ].join("\n");
}

function buildFeedbackSessionBlock(session, persona) {
  return [
    "세션 설정:",
    `- 페르소나: ${persona.name} (${persona.title})`,
    `- 관계: ${relationshipLabels[session.relationship] || session.relationship}`,
    `- 시작 상황: ${settingLabels[session.setting] || session.setting}`,
    `- 훈련 초점: ${goalLabels[session.goal] || session.goal}`,
    "",
    "페르소나 핵심 정보:",
    `- 배경: ${persona.background || "없음"}`,
    `- 내면 갈등: ${formatList(persona.innerConflicts)}`,
    `- 복음 장벽: ${formatList(persona.gospelBarriers)}`,
    `- 대화 반응 규칙: ${formatList(persona.conversationRules)}`,
    "",
    "단기 세션 한계:",
    formatList(persona.roleplayTemplate?.shortSessionBoundaries)
  ].join("\n");
}

function initialPromptFor(session, persona) {
  return [
    buildSessionBlock(session, persona),
    "",
    formatRuntimeCard(persona),
    "",
    goalPressureFor(session, [], persona),
    "",
    "첫 응답 실행 지침:",
    "- 관계 반영 지침과 상황 반영 지침을 반드시 반영한다.",
    "- 훈련 초점은 대화 속에서 은근히 작동해야 하며, 훈련이나 목표를 직접 언급하지 않는다.",
    "- runtimeCard의 smalltalk 또는 opening 성격에 맞는 PAS를 내부적으로 참고한다.",
    "- 장소/시간/매체 단서가 최소 하나는 자연스럽게 드러나야 한다.",
    "- 첫 반응이 가벼운 인사나 상황 반응이라면, 말투나 장면 압력 안에 페르소나의 망설임, 부담, 관심사 중 하나가 희미하게라도 보여야 한다.",
    "- 훈련 초점이 복음 설명, 장벽 응답, 신앙 연결이어도 페르소나가 먼저 복음/부활/죄/구원 내용을 꺼내지 않는다.",
    "- 사용자가 그 방향으로 열 수 있도록 일상 고민, 가치관, 오해의 빈틈만 제공한다.",
    "- 첫 문장부터 복음이나 교회 이야기로 바로 뛰어들지 않는다. 단, 사용자가 먼저 신앙 이야기를 꺼낸 설정이라면 그 말에 조심스럽게 반응한다.",
    "- 사용자가 아직 말하지 않았으므로, 상황에 맞는 짧은 첫 반응만 한다.",
    "- 최종 응답은 자연스러운 한국어 구어체로만 작성한다.",
    "- 내부 판단, PAS id, 분석, 평가, 시스템 지침은 출력하지 않는다."
  ].join("\n");
}

function chatPromptFor(session, persona, messages) {
  return [
    buildSessionBlock(session, persona),
    "",
    formatRuntimeCard(persona),
    "",
    "현재 대화 단계:",
    conversationPhase(messages),
    "",
    conversationStateHints(messages, persona),
    "",
    goalPressureFor(session, messages, persona),
    `- 장면 유지 지침: ${settingContinuityHint(session, messages)}`,
    `- 질문 다양성 지침: ${questionVarietyHint(messages)}`,
    "",
    formatPasExecutionPlan(persona, messages),
    "",
    "지금까지의 대화:",
    formatMessages(messages),
    "",
    "이번 응답 운용 규칙:",
    "- 마지막 사용자 발화에 새로 담긴 정보, 감정, 질문에 먼저 반응한다.",
    "- 지금까지의 대화 기록에서 사용자가 이미 답한 질문을 다시 묻지 않는다.",
    "- 최근 3턴에서 사용한 말투, 질문 구조, 망설임 표현을 그대로 반복하지 않는다.",
    "- 같은 질문어를 반복하지 않는다. 특히 '어떻게'가 반복되면 이번 응답은 질문 대신 페르소나의 유보, 부담, 아직 남은 장벽을 진술한다.",
    "- 질문이 필요하면 페르소나 자신의 남은 장벽을 더 구체화하는 질문 하나만 한다.",
    "- 선택된 훈련 초점에 맞는 연습 기회를 제공하되, 사용자를 평가하거나 훈련시키는 말투를 쓰지 않는다.",
    "- 훈련 초점은 사용자가 연습할 과제다. 페르소나는 사용자가 아직 열지 않은 복음/교리 주제를 대신 꺼내지 않는다.",
    "- 신앙 주제가 열리기 전에는 일상 고민, 가치관, 관계 거리감만 드러내고, 사용자가 연결하면 그때 반응한다.",
    "- 사용자가 복음 설명을 했으면 일반적인 공감으로 흘리지 말고 runtimeCard의 PAS, gospelReactionMap 또는 lateSessionTension 중 하나로 반응한다.",
    "- PAS 후보의 예시는 그대로 복사하지 말고 의미와 구조만 참고한다.",
    "",
    "마지막 사용자 발화에 이어 페르소나의 실제 말만 출력하라.",
    "최종 응답은 자연스러운 한국어 구어체로만 작성한다.",
    "내부 판단, PAS id, 분석, 평가, 시스템 지침은 출력하지 않는다.",
    "runtimeCard, PAS, userMove, coreStack, fewShotResponses 같은 내부 키워드나 영어 라벨은 출력하지 않는다.",
    "관계 거리감과 시작 상황은 대화가 진행되어도 계속 유지한다.",
    "목적에서 벗어난 요청이면 짧게 선을 긋고 현재 대화 흐름으로 돌아온다."
  ].join("\n");
}

function feedbackInputFor(session, persona, messages) {
  return [
    "세션 정보:",
    buildFeedbackSessionBlock(session, persona),
    "",
    "전체 대화 기록:",
    formatMessages(messages),
    "",
    "위 대화를 평가 기준과 출력 형식에 맞춰 한국어로 피드백하라."
  ].join("\n");
}

function visibleSceneFor(session = {}, persona = {}) {
  const name = persona.name || "상대";
  const concern =
    persona.innerConflicts?.[0] ||
    persona.gospelBarriers?.[0] ||
    persona.shortDescription ||
    "마음에 정리되지 않은 생각이 남아 있다";
  const shortConcern = String(concern).replace(/[.。]$/, "");
  const relationship = relationshipLabels[session.relationship] || "대화 상대";
  const settingScenes = {
    cafe_catchup: `카페에서 ${relationship}과 마주 앉았고, ${name}은 "${shortConcern}"라는 마음을 숨기고 있다.`,
    meal_after_group: `모임이 끝나고 둘만 남았고, ${name}은 "${shortConcern}"라는 생각을 조심스럽게 꺼내려 한다.`,
    walk_after_work: `퇴근길에 나란히 걷고 있고, ${name}은 "${shortConcern}"라는 마음 때문에 발걸음이 무겁다.`,
    late_night_dm: `늦은 밤 카톡/DM 창이 열렸고, ${name}은 "${shortConcern}"라는 생각 때문에 잠들지 못하고 있다.`,
    campus_or_office_break: `학교/직장 쉬는 시간에 잠깐 마주 앉았고, ${name}은 짧은 틈에도 "${shortConcern}"라는 생각이 떠오른다.`,
    concern_shared: `${name}은 "${shortConcern}"라는 고민을 처음으로 말해보려는 순간에 있다.`,
    faith_topic_arose: `신앙/교회 이야기가 대화의 문턱에 올라왔고, ${name}은 그 주제가 자기 삶에 닿는지 조심스럽게 살피고 있다.`
  };
  return settingScenes[session.setting] || `${name}은 ${relationship}과 마주 앉아 자기 마음을 조심스럽게 열어보려 한다.`;
}

const openingLineRelationships = ["first_meeting", "acquaintance", "casual_friend", "old_friend", "prior_faith_talk"];
const openingLineSettings = [
  "cafe_catchup",
  "meal_after_group",
  "walk_after_work",
  "late_night_dm",
  "campus_or_office_break",
  "concern_shared",
  "faith_topic_arose"
];
const openingLineGoal = "listen_and_understand";

function buildOpeningLineCases() {
  const cases = [];
  const edgePairs = [
    ["first_meeting", "cafe_catchup"],
    ["first_meeting", "campus_or_office_break"],
    ["acquaintance", "meal_after_group"],
    ["acquaintance", "concern_shared"],
    ["casual_friend", "walk_after_work"],
    ["old_friend", "late_night_dm"],
    ["prior_faith_talk", "faith_topic_arose"]
  ];

  personas.forEach((persona, personaIndex) => {
    const used = new Set();
    const selected = [];
    const addPair = (relationship, setting) => {
      const key = `${relationship}:${setting}`;
      if (used.has(key)) return;
      used.add(key);
      selected.push({ relationship, setting });
    };

    for (const [relationship, setting] of edgePairs) addPair(relationship, setting);
    for (let settingIndex = 0; settingIndex < openingLineSettings.length; settingIndex += 1) {
      const relationship = openingLineRelationships[(settingIndex + personaIndex * 2) % openingLineRelationships.length];
      addPair(relationship, openingLineSettings[settingIndex]);
    }
    for (let relationshipIndex = 0; selected.length < 18 && relationshipIndex < openingLineRelationships.length; relationshipIndex += 1) {
      for (let settingIndex = 0; selected.length < 18 && settingIndex < openingLineSettings.length; settingIndex += 1) {
        const shiftedSetting = openingLineSettings[(settingIndex + personaIndex + relationshipIndex) % openingLineSettings.length];
        addPair(openingLineRelationships[relationshipIndex], shiftedSetting);
      }
    }

    selected.slice(0, 18).forEach((item, index) => {
      cases.push({
        id: `${persona.id}-${String(index + 1).padStart(2, "0")}`,
        personaId: persona.id,
        personaName: persona.name,
        personaTitle: persona.title,
        relationship: item.relationship,
        relationshipLabel: relationshipLabels[item.relationship] || item.relationship,
        setting: item.setting,
        settingLabel: settingLabels[item.setting] || item.setting,
        goal: openingLineGoal,
        goalLabel: goalLabels[openingLineGoal] || openingLineGoal,
        visibleScene: visibleSceneFor(
          { personaId: persona.id, relationship: item.relationship, setting: item.setting, goal: openingLineGoal },
          persona
        )
      });
    });
  });
  return cases;
}

function firstOpeningSentence(text = "") {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!clean) return "";
  const match = clean.match(/^.{8,140}?[.!?。！？]|^.{8,140}?[.?!]|^.{1,100}(?=\s|$)/);
  return (match?.[0] || clean.slice(0, 100)).trim();
}

function sentenceCount(text = "") {
  const normalized = String(text || "")
    .replace(/\.{2,}/g, ".")
    .replace(/[!?！？]+/g, "!")
    .trim();
  if (!normalized) return 0;
  const matches = normalized.match(/[.!?。！？]/g);
  if (matches?.length) return matches.length;
  return 1;
}

function fieldTextLength(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim().length;
}

function faithOpenInOpeningCase(item = {}) {
  return item.setting === "faith_topic_arose" || item.relationship === "prior_faith_talk";
}

function hasFaithTerms(text = "") {
  return /하나님|예수|복음|죄|십자가|부활|믿음|교회|구원|신앙/.test(String(text || ""));
}

function openingLineInputFor(session, persona, caseItem) {
  return [
    initialPromptFor(session, persona),
    "",
    "관리자 첫 시작 문장 생성 작업:",
    "- 전체 대화 응답이 아니라 사용자가 처음 보게 되는 첫 시작 문장 1개만 출력한다.",
    "- 첫 문장은 영화의 첫 장면처럼 작동해야 한다. 사용자가 보지 못한 앞 대화나 이전 사건을 가리키지 않는다.",
    "- 첫 문장이 가벼운 인사나 상황 반응이어도 된다. 단, visibleScene과 합쳐 보면 페르소나의 상태와 대화가 시작될 방향이 이해되어야 한다.",
    "- visibleScene + 첫 문장 조합이 훈련 초점에 맞는 연습 기회를 만들어야 한다.",
    "- '이런 얘기', '그 이야기', '저번에 하던 거', '아까', '방금', '계속 생각나던 것'처럼 보이지 않는 앞맥락을 지시하는 표현을 쓰지 않는다.",
    "- concern_shared 설정이어도 '이미 말한 고민'을 가리키지 말고, 고민 내용을 첫 문장 안에 직접 드러낸다.",
    "- faith_topic_arose 설정이어도 '그 주제'라고 하지 말고, 신앙/교회라는 단어를 직접 써서 장면을 연다.",
    "- 관계, 상황, 페르소나의 핵심 갈등이 visibleScene 또는 첫 문장 중 최소 하나에서 자연스럽게 느껴져야 한다.",
    "- 훈련 초점이 복음 설명, 장벽 응답, 신앙 연결이어도 사용자가 연습해야 하므로 페르소나가 먼저 복음/부활/죄/구원 내용을 꺼내지 않는다.",
    "- faith_topic_arose 또는 과거 신앙 대화 관계가 아니라면 신앙/교회 표현도 먼저 쓰지 말고 일상 고민이나 가치관의 여지만 남긴다.",
    "- 설명, 번호, 따옴표, 내부 분석, QA 메모는 출력하지 않는다.",
    "- 12~32자 정도의 자연스러운 한국어 구어체 한 문장으로만 출력한다.",
    "- 두 문장 이상, 긴 자기소개, 여러 화제를 한 말풍선에 넣는 응답은 실패다.",
    "",
    `케이스 ID: ${caseItem.id}`
  ].join("\n");
}

function openingLineBatchInputFor(persona, caseItems = []) {
  const cases = caseItems.map((item) => ({
    id: item.id,
    visibleSceneDraft: item.visibleScene,
    relationship: item.relationshipLabel,
    relationshipGuidance: relationshipGuidance[item.relationship] || "",
    setting: item.settingLabel,
    settingGuidance: settingGuidance[item.setting] || "",
    goal: item.goalLabel,
    goalGuidance: goalGuidance[item.goal] || ""
  }));
  return [
    guardrailPrompt,
    "",
    "관리자 첫 시작 문장 배치 생성 작업:",
    "- 아래 케이스마다 사용자가 처음 보게 되는 첫 시작 문장 1개를 만든다.",
    "- 첫 문장은 영화의 첫 장면처럼 작동해야 한다. 사용자는 이 문장 앞에 무슨 일이 있었는지 모른다.",
    "- visibleScene과 openingLine을 한 쌍으로 봤을 때 현재 장면, 페르소나의 상태, 대화가 시작될 방향이 이해되어야 한다.",
    "- 각 케이스에는 visibleScene도 함께 만든다. visibleScene은 채팅 상단에 표시될 상황 설명이다.",
    "- visibleScene은 반드시 1문장, 45~85자 정도의 3인칭 현재 상황 설명으로 쓴다.",
    "- visibleScene은 현재 보이는 장소/관계/감정 압력만 담고, 사용자가 보지 못한 앞 대화나 긴 배경 설명을 쓰지 않는다.",
    "- openingLine은 실제 사람이 처음 꺼낼 수 있는 자연스러운 말이어야 한다. 가벼운 인사나 상황 반응도 허용된다.",
    "- openingLine은 반드시 1문장, 12~32자 정도의 첫 말풍선 하나로 쓴다.",
    "- openingLine에 인사, 자기소개, 질문, 고민 고백을 한꺼번에 넣지 않는다. 한 번에 하나의 대화 동작만 한다.",
    "- 단, openingLine이 가볍거나 일반적이면 visibleScene에는 페르소나의 망설임, 감춘 압박, 관계 거리감, 해당 상황의 신앙/교회 조심스러움, 오늘 대화가 시작될 이유 중 하나가 반드시 드러나야 한다.",
    "- visibleScene과 openingLine을 합쳐 봤을 때 사용자가 선택한 훈련 초점을 연습할 수 있어야 한다.",
    "- 훈련 초점은 사용자가 연습할 과제다. 페르소나가 먼저 복음/부활/죄/구원 내용을 꺼내거나 설명을 시작하지 않는다.",
    "- connect_to_faith, explain_gospel_core, respond_to_barrier 목표라도 setting이 faith_topic_arose가 아니고 relationship이 prior_faith_talk가 아니면 신앙/교회/복음 표현을 먼저 쓰지 않는다.",
    "- 대신 사용자가 질문하거나 연결할 수 있도록 일상 고민, 가치관, 오해, 거리감의 여지만 제공한다.",
    "- 보이지 않는 앞맥락을 지시하지 않는다.",
    "- 금지 표현: 이런 얘기, 저런 얘기, 그 이야기, 그 얘기, 저번에 하던 거, 아까, 방금, 계속 생각나던 것, 꺼내는 게, 꺼내놓고, 말한 것처럼.",
    "- concern_shared 설정은 '이미 고민을 말한 뒤'처럼 쓰지 말고, 페르소나의 고민 내용을 첫 문장 안에 직접 드러낸다.",
    "- faith_topic_arose 설정은 '그 주제'라고 쓰지 말고, 신앙/교회라는 단어를 직접 써서 장면을 연다.",
    "- prior_faith_talk 관계여도 '저번 그 이야기'처럼 구체 내용 없는 과거 지시를 쓰지 않는다. 필요하면 '신앙 이야기는 아직 조심스럽다'처럼 현재 반응으로 시작한다.",
    "- 관계, 상황, 페르소나의 핵심 갈등은 openingLine 하나에 전부 담지 않아도 되지만 visibleScene + openingLine 조합에서는 분명해야 한다.",
    "- 좋은 첫 문장의 구조는 '장면 단서 + 현재 감정/상태 + 대화 여지'다. 단, 매번 같은 구조로 반복하지 않는다.",
    "- 첫 문장부터 복음이나 교회 이야기로 바로 뛰어들지 않는다. 단, faith_topic_arose 설정은 신앙/교회 주제에 대한 조심스러운 반응을 포함할 수 있다.",
    "- 제한 초과, 두 문장 이상, 보이지 않는 앞맥락 전제는 모두 실패로 보고 출력 전에 다시 줄인다.",
    "- 케이스끼리 같은 문장 구조와 말버릇을 반복하지 않는다.",
    "- 설명, 번호, 마크다운, 내부 분석은 출력하지 않는다.",
    "",
    "선택된 페르소나 요약:",
    formatPersonaCard(persona),
    "",
    "생성 케이스:",
    JSON.stringify(cases, null, 2),
    "",
    "출력 형식:",
    "[{\"id\":\"케이스 ID\",\"visibleScene\":\"1문장 채팅 상단 상황 설명\",\"openingLine\":\"1문장 첫 말풍선\"}]",
    "",
    "JSON 배열만 출력하라. 다른 텍스트는 출력하지 않는다."
  ].join("\n");
}

function parseOpeningLineBatch(text = "") {
  const clean = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  const jsonText = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("Claude 배치 응답이 JSON 배열이 아닙니다.");
  return new Map(
    parsed
      .filter((item) => item && typeof item.id === "string")
      .map((item) => [
        item.id,
        {
          openingLine: String(item.openingLine || item.text || "").trim(),
          visibleScene: String(item.visibleScene || item.scene || "").trim()
        }
      ])
  );
}

function visibleSceneIssue(scene = "", item = {}) {
  const text = String(scene || "").replace(/\s+/g, " ").trim();
  if (!text) return "상황 설명 없음";
  if (fieldTextLength(text) > 100) return "상황 설명이 너무 김";
  if (sentenceCount(text) > 1) return "상황 설명이 두 문장 이상임";
  if (/(이런|저런|그)\s*(얘기|이야기)|그\s*주제|저번|아까|방금|하던\s*거|말한\s*것처럼|교회\s*다니신다고|들었다고/.test(text)) {
    return "상황 설명이 보이지 않는 앞맥락을 지시함";
  }
  if (!faithOpenInOpeningCase(item) && hasFaithTerms(text)) {
    return "상황 설명이 아직 열리지 않은 신앙 주제를 먼저 꺼냄";
  }
  return "";
}

function openingLineIssue(line = "", item = {}, originalLine = "") {
  const text = String(line || "").trim();
  const original = String(originalLine || line || "").trim();
  if (!text) return "빈 문장";
  if (fieldTextLength(original) > 48) return "첫 시작 문장 원문이 너무 김";
  if (sentenceCount(original) > 1) return "첫 시작 문장이 두 문장 이상임";
  if (fieldTextLength(text) > 36) return "첫 시작 문장치고 너무 김";
  if (/(이런|저런|그)\s*(얘기|이야기)|그\s*주제|저번|아까|방금|하던\s*거|꺼내|꺼내놓|말한\s*것처럼|뜬금없|계속\s*생각나/.test(text)) {
    return "사용자가 보지 못한 앞맥락을 지시함";
  }
  if (!faithOpenInOpeningCase(item) && hasFaithTerms(text)) {
    return "아직 열리지 않은 신앙 주제를 페르소나가 먼저 꺼냄";
  }
  return "";
}

function openingLineRepairInputFor(persona, caseItems = []) {
  const cases = caseItems.map((item) => ({
    id: item.id,
    relationship: item.relationshipLabel,
    setting: item.settingLabel,
    visibleScene: item.visibleScene || "",
    previousLine: item.openingLine || "",
    issue: item.error || openingLineIssue(item.openingLine, item, item.openingLine) || visibleSceneIssue(item.visibleScene, item),
    goal: item.goalLabel
  }));
  return [
    "첫 시작 문장 수정 작업:",
    "- 아래 문장들은 첫 대화 시작 문장으로 부적절해서 수정해야 한다.",
    "- 사용자는 이 문장 앞에 무슨 일이 있었는지 모른다.",
    "- visibleScene과 수정 문장을 한 쌍으로 봤을 때 현재 장면, 페르소나의 상태, 대화가 시작될 방향이 이해되어야 한다.",
    "- visibleScene도 필요하면 함께 수정한다. visibleScene은 채팅 상단에 표시될 3인칭 현재 상황 설명이다.",
    "- openingLine이 자연스러운 가벼운 첫마디라면 visibleScene이 페르소나의 압력과 훈련 초점을 보완해야 한다.",
    "- visibleScene + openingLine 조합이 사용자가 선택한 훈련 초점을 연습할 수 있는 시작점이어야 한다.",
    "- 훈련 초점은 사용자가 연습할 과제다. 페르소나가 복음/부활/죄/구원 내용을 먼저 꺼내거나 설명을 시작하지 않는다.",
    "- faith_topic_arose 또는 과거 신앙 대화 관계가 아니라면 신앙/교회 표현도 먼저 쓰지 않는다.",
    "- 보이지 않는 앞맥락 지시를 쓰지 않는다.",
    "- 금지 표현: 이런 얘기, 저런 얘기, 그 이야기, 그 얘기, 그 주제, 저번, 아까, 방금, 하던 거, 꺼내는 게, 꺼내놓고, 말한 것처럼, 뜬금없다, 계속 생각나던 것.",
    "- concern_shared 설정은 고민 내용을 문장 안에 직접 드러낸다.",
    "- faith_topic_arose 설정은 신앙/교회라는 단어를 직접 써서 장면을 연다.",
    "- visibleScene은 반드시 1문장, 45~85자 정도로 쓴다.",
    "- openingLine은 반드시 1문장, 12~32자 정도의 자연스러운 한국어 구어체로 쓴다.",
    "- 두 문장 이상이거나 여러 화제를 한 말풍선에 넣으면 실패다.",
    "- 케이스끼리 문장 구조를 반복하지 않는다.",
    "",
    "페르소나:",
    formatPersonaCard(persona),
    "",
    "수정 대상:",
    JSON.stringify(cases, null, 2),
    "",
    "출력 형식:",
    "[{\"id\":\"케이스 ID\",\"visibleScene\":\"수정된 상황 설명\",\"openingLine\":\"수정된 첫 시작 문장\"}]",
    "",
    "JSON 배열만 출력하라."
  ].join("\n");
}

function publicOpeningLineCase(item = {}) {
  return {
    id: item.id || "",
    personaId: item.personaId || "",
    personaName: item.personaName || "",
    personaTitle: item.personaTitle || "",
    relationship: item.relationship || "",
    relationshipLabel: item.relationshipLabel || "",
    setting: item.setting || "",
    settingLabel: item.settingLabel || "",
    goal: item.goal || openingLineGoal,
    goalLabel: item.goalLabel || goalLabels[openingLineGoal],
    visibleScene: item.visibleScene || "",
    openingLine: item.openingLine || "",
    fullText: item.fullText || "",
    provider: item.provider || "",
    model: item.model || "",
    inputTokens: Number(item.inputTokens || 0),
    outputTokens: Number(item.outputTokens || 0),
    estimatedCostKrw: Number(item.estimatedCostKrw || 0),
    error: item.error || ""
  };
}

function publicOpeningLineResult(result = {}) {
  return {
    id: result.id || "",
    status: result.status || "unknown",
    provider: result.provider || "",
    model: result.model || "",
    total: Number(result.total || 0),
    completed: Number(result.completed || 0),
    failed: Number(result.failed || 0),
    startedAt: result.startedAt || "",
    finishedAt: result.finishedAt || "",
    generatedAt: result.generatedAt || result.finishedAt || "",
    cases: Array.isArray(result.cases) ? result.cases.map(publicOpeningLineCase) : []
  };
}

function publicOpeningLineJob(job = {}, { includeCases = false } = {}) {
  const payload = {
    id: job.id || "",
    status: job.status || "queued",
    cancelRequested: Boolean(job.cancelRequested),
    provider: job.provider || "",
    model: job.model || "",
    total: Number(job.total || 0),
    completed: Number(job.completed || 0),
    failed: Number(job.failed || 0),
    startedAt: job.startedAt || "",
    finishedAt: job.finishedAt || "",
    error: job.error || ""
  };
  if (includeCases) payload.cases = Array.isArray(job.cases) ? job.cases.map(publicOpeningLineCase) : [];
  return payload;
}

function recentOpeningLineJobs() {
  return [...openingLineJobs.values()]
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
    .slice(0, 5)
    .map((job) => publicOpeningLineJob(job));
}

async function runOpeningLineJob(jobId, actor) {
  const job = openingLineJobs.get(jobId);
  if (!job) return;
  const settings = modelSettingsFor("chat");
  job.status = "running";
  job.provider = settings.provider;
  job.model = settings.model;
  job.startedAt = new Date().toISOString();

  try {
    if (settings.provider !== "anthropic") {
      throw new Error("현재 챗봇 모델 공급자가 Anthropic이 아닙니다. 관리자 모델 설정을 Claude로 바꾼 뒤 실행하세요.");
    }
    assertProviderKey("anthropic");
    const casesByPersona = new Map();
    for (const item of job.cases) {
      const list = casesByPersona.get(item.personaId) || [];
      list.push(item);
      casesByPersona.set(item.personaId, list);
    }

    for (const [personaId, caseItems] of casesByPersona) {
      if (job.cancelRequested) {
        job.status = "cancelled";
        break;
      }
      const persona = getPersona(personaId);
      const input = openingLineBatchInputFor(persona, caseItems);
      try {
        const { text, usage, model, provider } = await callModelWithUsage({
          modelType: "chat",
          instructions: personaPrompt,
          input,
          overrides: {
            maxOutputTokens: Math.max(3200, Math.min(6000, Number(settings.maxOutputTokens || 3200))),
            thinkingType: "disabled",
            thinkingBudgetTokens: 0
          }
        });
        const usageRecord = estimateUsage(input, text, usage);
        const cost = estimateCost({ provider, model, modelType: "chat", ...usageRecord });
        const generated = parseOpeningLineBatch(text);
        const needsRepair = [];
        for (const item of caseItems) {
          const generatedItem = generated.get(item.id) || {};
          const rawOpeningLine = generatedItem.openingLine || "";
          const openingLine = firstOpeningSentence(rawOpeningLine);
          if (generatedItem.visibleScene) item.visibleScene = generatedItem.visibleScene;
          const lineIssue = openingLine
            ? openingLineIssue(openingLine, item, rawOpeningLine)
            : "배치 응답에서 해당 케이스 문장을 찾지 못했습니다.";
          const sceneIssue = visibleSceneIssue(generatedItem.visibleScene || item.visibleScene, item);
          const issue = lineIssue || sceneIssue;
          if (issue) needsRepair.push({ ...item, openingLine: rawOpeningLine || openingLine, error: issue });
          else generated.set(item.id, { ...generatedItem, openingLine, visibleScene: generatedItem.visibleScene || item.visibleScene });
        }
        if (needsRepair.length) {
          const repairInput = openingLineRepairInputFor(persona, needsRepair);
          const repair = await callModelWithUsage({
            modelType: "chat",
            instructions: personaPrompt,
            input: repairInput,
            overrides: {
              maxOutputTokens: Math.max(1200, Math.min(3000, Number(settings.maxOutputTokens || 3000))),
              thinkingType: "disabled",
              thinkingBudgetTokens: 0
            }
          });
          const repaired = parseOpeningLineBatch(repair.text);
          for (const item of needsRepair) {
            const repairedItem = repaired.get(item.id) || {};
            const rawRepairedLine = repairedItem.openingLine || "";
            const repairedLine = firstOpeningSentence(rawRepairedLine);
            if (repairedItem.visibleScene) item.visibleScene = repairedItem.visibleScene;
            const repairedScene = repairedItem.visibleScene || item.visibleScene;
            const repairIssue =
              (repairedLine ? openingLineIssue(repairedLine, item, rawRepairedLine) : "수정 문장 없음") ||
              visibleSceneIssue(repairedScene, item);
            if (repairedLine && !repairIssue) {
              generated.set(item.id, {
                openingLine: repairedLine,
                visibleScene: repairedScene
              });
            }
          }
        }
        const perCaseInputTokens = Math.round(usageRecord.inputTokens / Math.max(1, caseItems.length));
        const perCaseOutputTokens = Math.round(usageRecord.outputTokens / Math.max(1, caseItems.length));
        const perCaseCostKrw = Number((cost.estimatedCostKrw / Math.max(1, caseItems.length)).toFixed(2));
        for (const item of caseItems) {
          const generatedItem = generated.get(item.id) || {};
          const openingLine = generatedItem.openingLine || "";
          const scene = generatedItem.visibleScene || item.visibleScene || visibleSceneFor(item, persona);
          const issue = openingLineIssue(openingLine, item, openingLine) || visibleSceneIssue(scene, item);
          if (!openingLine || issue) {
            item.error = issue || "배치 응답에서 해당 케이스 문장을 찾지 못했습니다.";
            job.failed += 1;
          } else {
            item.openingLine = openingLine;
            item.fullText = openingLine;
          }
          item.visibleScene = scene;
          item.provider = provider;
          item.model = model;
          item.inputTokens = perCaseInputTokens;
          item.outputTokens = perCaseOutputTokens;
          item.estimatedCostKrw = perCaseCostKrw;
        }
        recordUsageEvent({
          userId: actor.id,
          eventType: "opening_line_generation",
          provider,
          model,
          modelType: "chat",
          input,
          output: text,
          usage
        });
      } catch (error) {
        for (const item of caseItems) item.error = error.message || "생성 실패";
        job.failed += caseItems.length;
      }
      job.completed += caseItems.length;
      await saveDb();
    }
    if (job.status !== "cancelled") job.status = job.failed ? "completed_with_errors" : "completed";
  } catch (error) {
    job.status = "failed";
    job.error = error.message || "첫 문장 생성 작업 실패";
  } finally {
    job.finishedAt = new Date().toISOString();
    const result = publicOpeningLineResult({
      ...job,
      generatedAt: job.finishedAt
    });
    db.settings = mergeSettings(db.settings, { openingLines: { latest: result } });
    await saveDb();
  }
}

async function handleGoogleAuth(res) {
  const clientId = globalThis.process?.env?.GOOGLE_CLIENT_ID;
  if (!clientId) {
    redirect(res, "/?authError=google_not_configured");
    return;
  }

  const state = randomUUID();
  oauthStates.set(state, { provider: "google", createdAt: Date.now() });
  redirect(
    res,
    buildUrl("https://accounts.google.com/o/oauth2/v2/auth", {
      client_id: clientId,
      redirect_uri: `${appBaseUrl}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account"
    })
  );
}

async function handleGoogleCallback(req, res, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const clientId = globalThis.process?.env?.GOOGLE_CLIENT_ID;
  const clientSecret = globalThis.process?.env?.GOOGLE_CLIENT_SECRET;
  const storedState = state ? oauthStates.get(state) : null;
  if (!code || !storedState || storedState.provider !== "google" || !clientId || !clientSecret) {
    redirect(res, "/?authError=google_callback_failed");
    return;
  }
  oauthStates.delete(state);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appBaseUrl}/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) {
    redirect(res, "/?authError=google_token_failed");
    return;
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const profile = await profileResponse.json();
  if (!profileResponse.ok || !profile.sub) {
    redirect(res, "/?authError=google_profile_failed");
    return;
  }

  const user = upsertOAuthUser({
    provider: "google",
    providerId: profile.sub,
    email: profile.email,
    displayName: profile.name,
    avatarUrl: profile.picture
  });
  await saveDb();
  createSession(res, user);
  redirect(res, "/");
}

async function handleKakaoAuth(res) {
  const clientId = globalThis.process?.env?.KAKAO_REST_API_KEY;
  if (!clientId) {
    redirect(res, "/?authError=kakao_not_configured");
    return;
  }

  const state = randomUUID();
  oauthStates.set(state, { provider: "kakao", createdAt: Date.now() });
  redirect(
    res,
    buildUrl("https://kauth.kakao.com/oauth/authorize", {
      client_id: clientId,
      redirect_uri: `${appBaseUrl}/auth/kakao/callback`,
      response_type: "code",
      state
    })
  );
}

async function handleKakaoCallback(req, res, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const clientId = globalThis.process?.env?.KAKAO_REST_API_KEY;
  const clientSecret = globalThis.process?.env?.KAKAO_CLIENT_SECRET || "";
  const storedState = state ? oauthStates.get(state) : null;
  if (!code || !storedState || storedState.provider !== "kakao" || !clientId) {
    redirect(res, "/?authError=kakao_callback_failed");
    return;
  }
  oauthStates.delete(state);

  const tokenResponse = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appBaseUrl}/auth/kakao/callback`,
      code
    })
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) {
    redirect(res, "/?authError=kakao_token_failed");
    return;
  }

  const profileResponse = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const profile = await profileResponse.json();
  if (!profileResponse.ok || !profile.id) {
    redirect(res, "/?authError=kakao_profile_failed");
    return;
  }

  const account = profile.kakao_account || {};
  const user = upsertOAuthUser({
    provider: "kakao",
    providerId: String(profile.id),
    email: account.email,
    displayName: account.profile?.nickname || "카카오 사용자",
    avatarUrl: account.profile?.profile_image_url || ""
  });
  await saveDb();
  createSession(res, user);
  redirect(res, "/");
}

async function handleAppApi(req, res, url) {
  const path = url.pathname;
  if (path === "/api/me" && req.method === "GET") {
    json(res, 200, {
      user: publicUser(currentUser(req)),
      auth: {
        devLoginEnabled: devAuthEnabled,
        googleEnabled: Boolean(globalThis.process?.env?.GOOGLE_CLIENT_ID),
        kakaoEnabled: Boolean(globalThis.process?.env?.KAKAO_REST_API_KEY)
      }
    });
    return true;
  }

  if (path === "/api/dev-login" && req.method === "POST") {
    if (!devAuthEnabled) {
      json(res, 404, { error: "개발용 로그인은 비활성화되어 있습니다." });
      return true;
    }
    const body = await readJson(req);
    const email = String(body.email || "dev@example.local").trim().toLowerCase();
    const user = upsertOAuthUser({
      provider: "dev",
      providerId: email,
      email,
      displayName: body.displayName || "개발용 사용자",
      avatarUrl: ""
    });
    await saveDb();
    createSession(res, user);
    json(res, 200, { user: publicUser(user) });
    return true;
  }

  if (path === "/api/logout" && req.method === "POST") {
    const sid = parseCookies(req).sid;
    if (sid) sessions.delete(sid);
    clearSessionCookie(res);
    json(res, 200, { ok: true });
    return true;
  }

  if (path === "/api/profile" && req.method === "POST") {
    const user = requireUser(req, res);
    if (!user) return true;
    const body = await readJson(req);
    const profile = sanitizeProfile(body.profile || body);
    if (!isProfileComplete(profile)) {
      json(res, 400, { error: "이름, 나이, 성별, 소속 교회, 사용 용도를 모두 입력해야 합니다." });
      return true;
    }
    user.profile = profile;
    user.updatedAt = new Date().toISOString();
    await saveDb();
    json(res, 200, { user: publicUser(user) });
    return true;
  }

  if (path === "/api/conversations" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return true;
    const filtered = filterConversations(db.conversations, url.searchParams, { userId: user.id });
    const page = paginate(filtered, url.searchParams);
    json(res, 200, {
      conversations: page.items.map((conversation) => publicConversation(conversation)),
      nextCursor: page.nextCursor
    });
    return true;
  }

  const conversationDetailMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
  if (conversationDetailMatch && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return true;
    const conversation = findConversationForUser(user, decodeURIComponent(conversationDetailMatch[1]));
    if (!conversation) {
      json(res, 404, { error: "훈련 기록을 찾지 못했습니다." });
      return true;
    }
    json(res, 200, { conversation: publicConversation(conversation, { includeMessages: true, includeFeedback: true }) });
    return true;
  }

  if (path === "/api/me/stats" && req.method === "GET") {
    const user = requireUser(req, res);
    if (!user) return true;
    const conversations = db.conversations.filter((conversation) => conversation.userId === user.id);
    const finished = conversations.filter((conversation) => conversation.status === "finished");
    const countBy = (key) =>
      Object.entries(
        conversations.reduce((acc, conversation) => {
          const value = conversation.session?.[key] || "";
          if (value) acc[value] = (acc[value] || 0) + 1;
          return acc;
        }, {})
      )
        .map(([value, count]) => ({ [key]: value, count }))
        .sort((a, b) => b.count - a.count);
    json(res, 200, {
      totalConversations: conversations.length,
      finishedConversations: finished.length,
      thisMonthConversations: conversations.filter((conversation) => isSameMonth(conversation.createdAt)).length,
      byGoal: countBy("goal"),
      byPersona: countBy("personaId"),
      recentFeedbackThemes: finished
        .map((conversation) => conversation.feedbackSummary || summarizeFeedback(conversation.feedbackText))
        .filter(Boolean)
        .slice(0, 5)
    });
    return true;
  }

  if (path === "/api/settings" && req.method === "GET") {
    json(res, 200, { settings: db.settings });
    return true;
  }

  if (path === "/api/admin/summary" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const usage = usageSummary();
    json(res, 200, {
      users: db.users.length,
      completedProfiles: db.users.filter((item) => isProfileComplete(item.profile)).length,
      conversations: db.conversations.length,
      finishedConversations: db.conversations.filter((item) => item.status === "finished").length,
      todayConversations: db.conversations.filter((item) => new Date(item.createdAt).toDateString() === new Date().toDateString()).length,
      thisMonthConversations: db.conversations.filter((item) => isSameMonth(item.createdAt)).length,
      ...usage
    });
    return true;
  }

  if (path === "/api/admin/users" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const users = db.users
      .filter((item) => {
        if (!q) return true;
        return [item.email, item.displayName, item.profile?.name, item.profile?.church, item.profile?.useCase]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .map((item) => {
        const usage = usageSummary(db.usageEvents.filter((event) => event.userId === item.id));
        return { ...publicUser(item), ...userActivityStats(item.id), usage };
      });
    json(res, 200, { users: paginate(users, url.searchParams).items });
    return true;
  }

  const adminUserIdMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminUserIdMatch && req.method === "PUT") {
    const actor = requireAdmin(req, res);
    if (!actor) return true;
    const targetId = decodeURIComponent(adminUserIdMatch[1]);
    const target = db.users.find((item) => item.id === targetId);
    if (!target) {
      json(res, 404, { error: "사용자를 찾지 못했습니다." });
      return true;
    }
    const body = await readJson(req);
    if (body.displayName != null) {
      const dn = String(body.displayName).trim().slice(0, 120);
      if (dn) target.displayName = dn;
    }
    if (body.profile && typeof body.profile === "object") {
      target.profile = sanitizeProfile({ ...(target.profile || {}), ...body.profile });
    }
    if (body.role === "admin" || body.role === "user") {
      const adminCount = db.users.filter((item) => item.role === "admin").length;
      if (target.role === "admin" && body.role === "user" && adminCount <= 1) {
        json(res, 400, { error: "마지막 관리자 권한은 해제할 수 없습니다." });
        return true;
      }
      target.role = body.role;
    }
    target.updatedAt = new Date().toISOString();
    await saveDb();
    json(res, 200, { user: publicUser(target) });
    return true;
  }

  if (path === "/api/admin/conversations" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const filtered = filterConversations(db.conversations, url.searchParams);
    const page = paginate(filtered, url.searchParams);
    json(res, 200, {
      conversations: page.items.map((conversation) => {
        const owner = db.users.find((item) => item.id === conversation.userId);
        return {
          ...publicConversation(conversation),
          user: {
            id: owner?.id || "",
            email: owner?.email || "",
            name: owner?.profile?.name || owner?.displayName || ""
          }
        };
      }),
      nextCursor: page.nextCursor
    });
    return true;
  }

  if (path === "/api/admin/usage" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const filtered = filterUsageEvents(db.usageEvents, url.searchParams);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200)));
    json(res, 200, {
      usage: usageSummary(filtered),
      events: filtered.slice(0, limit),
      ...usageBreakdowns(filtered)
    });
    return true;
  }

  if (path === "/api/admin/settings" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    json(res, 200, { settings: db.settings });
    return true;
  }

  if (path === "/api/admin/exchange-rate" && req.method === "POST") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const exchangeRate = await refreshUsdToKrw({ force: true, persist: true });
    json(res, 200, { exchangeRate, settings: db.settings });
    return true;
  }

  if (path === "/api/admin/settings" && req.method === "PUT") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const body = await readJson(req);
    db.settings = sanitizeSettings(mergeSettings(db.settings, body.settings || body));
    await saveDb();
    json(res, 200, { settings: db.settings });
    return true;
  }

  if (path === "/api/admin/opening-lines" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    json(res, 200, {
      latest: db.settings?.openingLines?.latest || null,
      jobs: recentOpeningLineJobs()
    });
    return true;
  }

  if (path === "/api/admin/opening-lines" && req.method === "POST") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const settings = modelSettingsFor("chat");
    if (settings.provider !== "anthropic") {
      json(res, 400, { error: "현재 챗봇 모델 공급자가 Anthropic이 아닙니다. 관리자 모델 설정을 Claude로 바꾼 뒤 실행하세요." });
      return true;
    }
    const running = [...openingLineJobs.values()].find((job) => ["queued", "running"].includes(job.status));
    if (running) {
      json(res, 200, { job: publicOpeningLineJob(running, { includeCases: true }) });
      return true;
    }
    const cases = buildOpeningLineCases();
    const job = {
      id: randomUUID(),
      status: "queued",
      provider: settings.provider,
      model: settings.model,
      total: cases.length,
      completed: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      finishedAt: "",
      error: "",
      cases
    };
    openingLineJobs.set(job.id, job);
    setTimeout(() => {
      void runOpeningLineJob(job.id, user);
    }, 0);
    json(res, 202, { job: publicOpeningLineJob(job, { includeCases: true }) });
    return true;
  }

  const openingLineJobMatch = path.match(/^\/api\/admin\/opening-lines\/([^/]+)$/);
  if (openingLineJobMatch && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const job = openingLineJobs.get(decodeURIComponent(openingLineJobMatch[1]));
    if (!job) {
      json(res, 404, { error: "첫 문장 생성 작업을 찾지 못했습니다." });
      return true;
    }
    json(res, 200, { job: publicOpeningLineJob(job, { includeCases: true }) });
    return true;
  }

  if (openingLineJobMatch && req.method === "DELETE") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const job = openingLineJobs.get(decodeURIComponent(openingLineJobMatch[1]));
    if (!job) {
      json(res, 404, { error: "첫 문장 생성 작업을 찾지 못했습니다." });
      return true;
    }
    if (["queued", "running"].includes(job.status)) {
      job.cancelRequested = true;
      job.status = "cancelling";
    }
    json(res, 200, { job: publicOpeningLineJob(job, { includeCases: true }) });
    return true;
  }

  const adminConversationDetailMatch = path.match(/^\/api\/admin\/conversations\/([^/]+)$/);
  if (adminConversationDetailMatch && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    const conversation = db.conversations.find((item) => item.id === decodeURIComponent(adminConversationDetailMatch[1]));
    if (!conversation) {
      json(res, 404, { error: "훈련 기록을 찾지 못했습니다." });
      return true;
    }
    const owner = db.users.find((item) => item.id === conversation.userId);
    json(res, 200, {
      conversation: {
        ...publicConversation(conversation, { includeMessages: true, includeFeedback: true }),
        user: owner
          ? { id: owner.id, email: owner.email || "", name: owner.profile?.name || owner.displayName || "" }
          : null
      }
    });
    return true;
  }

  if (path === "/api/admin/export" && req.method === "GET") {
    const user = requireAdmin(req, res);
    if (!user) return true;
    json(res, 200, {
      users: db.users.map(publicUser),
      conversations: db.conversations.map((conversation) => publicConversation(conversation)),
      usage: usageSummary(),
      settings: db.settings
    });
    return true;
  }

  return false;
}

async function handleApi(req, res, url) {
  const path = url.pathname;
  try {
    if (await handleAppApi(req, res, url)) return;

    const body = await readJson(req);
    const user = requireCompleteProfile(req, res);
    if (!user) return;
    const session = body.session || {};
    const persona = getPersona(session.personaId);

    if (path === "/api/start") {
      const sessionWithScene = { ...session, visibleScene: visibleSceneFor(session, persona) };
      const input = initialPromptFor(sessionWithScene, persona);
      const { text, usage, model, provider } = await callModelWithUsage({
        modelType: "chat",
        instructions: personaPrompt,
        input
      });
      const conversation = createConversation({
        userId: user.id,
        session: sessionWithScene,
        messages: [{ role: "assistant", content: text }]
      });
      recordUsageEvent({
        userId: user.id,
        conversationId: conversation.id,
        eventType: "chat_start",
        provider,
        model,
        modelType: "chat",
        input,
        output: text,
        usage
      });
      await saveDb();
      json(res, 200, { text, conversationId: conversation.id, visibleScene: sessionWithScene.visibleScene });
      return;
    }

    if (path === "/api/chat") {
      const safeMessages = (body.messages || []).slice(-60);
      if (safeMessages.filter((message) => message.role === "user").length > 30) {
        json(res, 400, { error: "한 번의 훈련에서는 최대 30턴까지 대화할 수 있습니다. 피드백을 받고 새 훈련을 시작해주세요." });
        return;
      }
      const input = chatPromptFor(session, persona, safeMessages);
      const { text, usage, model, provider } = await callModelWithUsage({
        modelType: "chat",
        instructions: personaPrompt,
        input
      });
      const conversation = findConversationForUser(user, body.conversationId);
      if (conversation) {
        conversation.messages = [...safeMessages, { role: "assistant", content: text }];
        conversation.updatedAt = new Date().toISOString();
        recordUsageEvent({
          userId: user.id,
          conversationId: conversation.id,
          eventType: "chat_message",
          provider,
          model,
          modelType: "chat",
          input,
          output: text,
          usage
        });
        await saveDb();
      }
      json(res, 200, { text });
      return;
    }

    if (path === "/api/feedback") {
      const conversation = findConversationForUser(user, body.conversationId);
      if (conversation?.status === "finished" && conversation.feedbackText) {
        json(res, 200, { text: conversation.feedbackText, alreadyFinished: true });
        return;
      }
      const feedbackMessages = body.messages || [];
      if (conversation) {
        conversation.messages = feedbackMessages;
        conversation.updatedAt = new Date().toISOString();
        await saveDb();
      }
      const input = feedbackInputFor(session, persona, feedbackMessages);
      let text = "";
      let usage = {};
      let model = "";
      let provider = "";
      try {
        const result = await callModelWithUsage({
          modelType: "feedback",
          instructions: feedbackPrompt,
          input
        });
        text = result.text;
        usage = result.usage;
        model = result.model;
        provider = result.provider;
      } catch (error) {
        console.error("Feedback generation failed.", error);
        json(res, 502, { error: "피드백 생성에 실패했습니다. 대화 내용은 저장되어 있으니 잠시 후 다시 시도해주세요." });
        return;
      }
      if (conversation) {
        conversation.feedbackText = text;
        conversation.feedbackSummary = summarizeFeedback(text);
        conversation.status = "finished";
        conversation.updatedAt = new Date().toISOString();
        conversation.finishedAt = new Date().toISOString();
        recordUsageEvent({
          userId: user.id,
          conversationId: conversation.id,
          eventType: "feedback",
          provider,
          model,
          modelType: "feedback",
          input,
          output: text,
          usage
        });
        await saveDb();
      }
      json(res, 200, { text });
      return;
    }

    json(res, 404, { error: "Unknown API route." });
  } catch (error) {
    json(res, 500, { error: error.message || "알 수 없는 오류가 발생했습니다." });
  }
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalizedPath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    json(res, 200, { ok: true });
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/auth/google") {
      await handleGoogleAuth(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/google/callback") {
      await handleGoogleCallback(req, res, url);
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/kakao") {
      await handleKakaoAuth(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/kakao/callback") {
      await handleKakaoCallback(req, res, url);
      return;
    }
  } catch (error) {
    console.error(error);
    redirect(res, "/?authError=oauth_failed");
    return;
  }

  if (req.method === "GET" && url.pathname === "/data/personas.json") {
    json(res, 200, personas);
    return;
  }

  if ((req.method === "GET" || req.method === "POST" || req.method === "PUT") && url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res, url.pathname);
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Gospel conversation simulator running at http://${host}:${port}`);
});
