#!/usr/bin/env node
/**
 * 6명 페르소나 × (/api/start + 선택적 /api/chat 1턴) Claude 연동 스모크.
 *
 * 전제:
 * - 서버 실행 중 (기본 http://127.0.0.1:4173, QA_BASE_URL 로 변경)
 * - `GET /api/settings` → `settings.ai.chat.provider === "anthropic"` (Render/관리자에서 채팅을 Claude로 설정)
 * - 서버에 `ANTHROPIC_API_KEY` 설정
 * - 비프로덕션이면 개발용 로그인 허용(기본). 프로덕션은 ENABLE_DEV_LOGIN=true 필요
 *
 * 환경 변수:
 * - QA_BASE_URL — API 베이스
 * - QA_START_ONLY=1 — /api/start 만 (비용 절감)
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const base = (process.env.QA_BASE_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");
const startOnly = process.env.QA_START_ONLY === "1";

let cookie = "";

function absorbSetCookie(res) {
  const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of lines) {
    if (!/^sid=/i.test(line)) continue;
    const pair = line.split(";")[0].trim();
    const val = pair.slice(4);
    if (!val || val === '""') cookie = "";
    else cookie = pair;
  }
}

async function api(path, { method = "GET", json: body } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  absorbSetCookie(res);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  return { res, data };
}

const sessionBase = {
  relationship: "first_meeting",
  setting: "cafe_catchup",
  goal: "listen_and_understand"
};

async function main() {
  const me = await api("/api/me");
  if (!me.res.ok) {
    console.error("FAIL /api/me", me.res.status);
    process.exit(1);
  }
  if (!me.data.auth?.devLoginEnabled) {
    console.error("FAIL: 개발용 로그인이 꺼져 있습니다. (프로덕션은 ENABLE_DEV_LOGIN=true)");
    process.exit(1);
  }

  const settingsRes = await api("/api/settings");
  if (!settingsRes.res.ok) {
    console.error("FAIL /api/settings", settingsRes.res.status);
    process.exit(1);
  }
  const chat = settingsRes.data.settings?.ai?.chat || {};
  if (chat.provider !== "anthropic") {
    console.error(
      `FAIL: 채팅 provider가 anthropic이 아닙니다 (현재: ${chat.provider || "?"}). 관리자 설정에서 Claude로 바꾼 뒤 다시 실행하세요.`
    );
    process.exit(1);
  }
  console.log("OK 설정: 채팅 = anthropic, model =", chat.model || "?");

  const login = await api("/api/dev-login", { method: "POST", json: {} });
  if (!login.res.ok) {
    console.error("FAIL /api/dev-login", login.res.status, login.data);
    process.exit(1);
  }

  const profile = await api("/api/profile", {
    method: "POST",
    json: {
      profile: {
        name: "QA Claude",
        age: "30",
        gender: "남성",
        church: "QA 교회",
        useCase: "자동 스모크"
      }
    }
  });
  if (!profile.res.ok) {
    console.error("FAIL /api/profile", profile.res.status, profile.data);
    process.exit(1);
  }

  const personasPath = join(root, "..", "data", "personas.json");
  const personas = JSON.parse(await readFile(personasPath, "utf8"));
  const ids = personas.map((p) => p.id).filter(Boolean);
  if (ids.length !== 6) {
    console.warn("WARN: 최상위 페르소나 개수가 6이 아님:", ids.length, ids);
  }

  let failed = 0;
  for (const personaId of ids) {
    const session = { ...sessionBase, personaId };
    process.stdout.write(`→ ${personaId} /api/start … `);
    const start = await api("/api/start", { method: "POST", json: { session } });
    if (!start.res.ok) {
      console.log("FAIL", start.res.status, start.data?.error || start.data);
      failed += 1;
      continue;
    }
    const text = start.data.text;
    const conversationId = start.data.conversationId;
    if (!text || String(text).trim().length < 8) {
      console.log("FAIL 빈 응답 또는 너무 짧음");
      failed += 1;
      continue;
    }
    console.log("OK", `(${String(text).slice(0, 48).replace(/\n/g, " ")}…)`);

    if (!startOnly && conversationId) {
      process.stdout.write(`   … /api/chat 1턴 … `);
      const messages = [
        { role: "assistant", content: text },
        { role: "user", content: "안녕, 오늘 좀 피곤해서 말 걸어줘서 고마워." }
      ];
      const chatRes = await api("/api/chat", {
        method: "POST",
        json: { conversationId, session, messages }
      });
      if (!chatRes.res.ok) {
        console.log("FAIL", chatRes.res.status, chatRes.data?.error || chatRes.data);
        failed += 1;
        continue;
      }
      const reply = chatRes.data.text;
      if (!reply || String(reply).trim().length < 4) {
        console.log("FAIL 두 번째 응답 비정상");
        failed += 1;
        continue;
      }
      console.log("OK");
    }
  }

  if (failed) {
    console.error(`\n완료: ${failed}건 실패`);
    process.exit(1);
  }
  console.log("\n완료: 6명 페르소나 모두 Claude 경로로 오류 없이 통과");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
