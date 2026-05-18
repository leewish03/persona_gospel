#!/usr/bin/env node
/**
 * 경량 스모크: 배포 URL 또는 로컬 서버에 /healthz 확인.
 * 실제 OpenAI/Anthropic 대화 검증은 세션·프로필이 필요하므로
 * OPENAI_API_KEY / ANTHROPIC_API_KEY 와 로그인 쿠키가 있을 때만
 * `SMOKE_FULL=1` 로 확장할 수 있습니다.
 */
const base = (process.env.SMOKE_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");

async function main() {
  let health;
  try {
    health = await fetch(`${base}/healthz`);
  } catch (e) {
    if (e?.cause?.code === "ECONNREFUSED" || e?.code === "ECONNREFUSED") {
      console.warn("SKIP smoke: server not running at", base, "(start with npm start)");
      return;
    }
    throw e;
  }
  if (!health.ok) {
    console.error("FAIL /healthz", health.status);
    process.exit(1);
  }
  const j = await health.json();
  if (!j.ok) {
    console.error("FAIL /healthz body", j);
    process.exit(1);
  }
  console.log("OK /healthz", base);

  if (process.env.SMOKE_FULL !== "1") {
    console.log("Skip LLM smoke (set SMOKE_FULL=1 and valid session cookie + keys to extend).");
    return;
  }
  console.log("SMOKE_FULL: no automated chat in this script yet; use browser admin + training flow.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
