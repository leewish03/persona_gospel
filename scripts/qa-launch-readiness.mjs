#!/usr/bin/env node
const base = (process.env.QA_BASE_URL || process.env.SMOKE_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");
const jar = new Map();

function storeCookies(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return;
  for (const part of raw.split(/,\s*(?=[^;,]+=)/)) {
    const [pair] = part.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;
  if (["POST", "PUT", "DELETE", "PATCH"].includes(options.method || "")) {
    const csrf = jar.get("csrf");
    if (csrf) headers["X-CSRF-Token"] = decodeURIComponent(csrf);
  }
  const response = await fetch(`${base}${path}`, { ...options, headers });
  storeCookies(response);
  return response;
}

async function expectOk(path, options) {
  const response = await request(path, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${path} failed: ${response.status} ${body.slice(0, 300)}`);
  }
  return response;
}

async function main() {
  await expectOk("/healthz");
  await expectOk("/manifest.webmanifest");
  await expectOk("/sw.js");
  await expectOk("/assets/app-icon-192.png");
  await expectOk("/assets/app-icon-512.png");
  await expectOk("/privacy.html");
  await expectOk("/terms.html");

  const me = await expectOk("/api/me");
  const meBody = await me.json();
  if (!meBody.csrfToken && !jar.get("csrf")) throw new Error("/api/me did not issue a CSRF token");

  const loginEmail = `qa-launch-${Date.now()}@example.local`;
  await expectOk("/api/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: loginEmail, displayName: "QA Launch" })
  });
  await expectOk("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { name: "QA", age: "30", gender: "테스트", church: "테스트 교회", useCase: "출시 QA" } })
  });
  await expectOk("/api/app-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "bug", message: "출시 준비 자동 QA 피드백입니다.", page: "qa" })
  });
  const exported = await expectOk("/api/me/export");
  const exportBody = await exported.json();
  if (!exportBody.export?.user?.id) throw new Error("/api/me/export returned an invalid payload");
  await expectOk("/api/me", { method: "DELETE" });
  const afterDelete = await expectOk("/api/me");
  const afterBody = await afterDelete.json();
  if (afterBody.user) throw new Error("Deleted account is still authenticated");

  console.log("OK launch readiness QA", base);
}

main().catch((error) => {
  if (error?.cause?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(error?.message || "")) {
    if (process.env.QA_BASE_URL || process.env.SMOKE_URL) {
      console.error(error);
      process.exit(1);
    }
    console.warn("SKIP launch QA: server not running at", base);
    return;
  }
  console.error(error);
  process.exit(1);
});
