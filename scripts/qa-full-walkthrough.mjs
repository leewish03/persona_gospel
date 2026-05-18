/**
 * 로컬 서버(기본 http://127.0.0.1:4173)에서 주요 화면을 순회하며 스크린샷을 남깁니다.
 * 실행: node scripts/qa-full-walkthrough.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "..", "docs", "qa-screenshots", "manual-session");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:4173";

async function clickFooterPrimary(page, label) {
  await page.evaluate((text) => {
    const main = document.querySelector("main");
    const scope = main || document.body;
    for (const footer of scope.querySelectorAll("footer")) {
      for (const btn of footer.querySelectorAll("button")) {
        const t = btn.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!btn.disabled && (t === text || t.includes(text))) {
          btn.click();
          return;
        }
      }
    }
    throw new Error(`footer button not found: ${text}`);
  }, label);
}

async function shot(page, name) {
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR"
  });
  const page = await context.newPage();
  const log = [];

  try {
    await page.goto(base, { waitUntil: "networkidle", timeout: 30_000 });
    await shot(page, "01-home");
    log.push(`01-home: ${join(outDir, "01-home.png")}`);

    await page.getByRole("button", { name: "로그인하고 시작" }).click();
    await page.waitForTimeout(300);
    await shot(page, "02-login");
    log.push(`02-login: ${join(outDir, "02-login.png")}`);

    const devBtn = page.getByRole("button", { name: "개발용 로그인" });
    if ((await devBtn.count()) === 0) {
      log.push("SKIP: 개발용 로그인 버튼 없음 (devLoginEnabled false)");
      await browser.close();
      console.log(log.join("\n"));
      return;
    }
    await devBtn.click();
    await page.waitForTimeout(600);
    await shot(page, "03-profile-or-home");
    log.push(`03-profile-or-home: ${join(outDir, "03-profile-or-home.png")}`);

    const saveBtn = page.getByRole("button", { name: "저장하고 시작" });
    if ((await saveBtn.count()) > 0) {
      await page.locator("#profile-name").fill("QA 테스터");
      await page.locator("#profile-age").fill("30");
      await page.locator("#profile-gender").click();
      await page.getByRole("option", { name: "남성" }).click();
      await page.locator("#profile-church").fill("QA 교회");
      await page.locator("#profile-use").fill("개인 전도 훈련");
      await shot(page, "04-profile-filled");
      log.push(`04-profile-filled: ${join(outDir, "04-profile-filled.png")}`);
      await saveBtn.click();
      await page.waitForTimeout(800);
    }

    await shot(page, "05-after-profile");
    log.push(`05-after-profile: ${join(outDir, "05-after-profile.png")}`);

    await page.locator(".text-white").getByRole("button", { name: "훈련 시작" }).evaluate((b) => b.click());
    await page.getByRole("heading", { name: "페르소나 선택" }).waitFor({ state: "visible", timeout: 15_000 });
    await shot(page, "06-persona");
    log.push(`06-persona: ${join(outDir, "06-persona.png")}`);

    await clickFooterPrimary(page, "다음");
    await page.waitForTimeout(400);
    await shot(page, "07-context-empty");
    log.push(`07-context-empty: ${join(outDir, "07-context-empty.png")}`);

    await page.locator("#relationship").click();
    await page.getByRole("option", { name: "처음 만난 사람" }).click();
    await page.locator("#setting").click();
    await page.getByRole("option", { name: "카페에서 대화를 나누는 중" }).click();
    await page.locator("#goal").click();
    await page.getByRole("option", { name: "상대의 말 듣고 이해하기" }).click();
    await page.waitForTimeout(300);
    await shot(page, "08-context-filled");
    log.push(`08-context-filled: ${join(outDir, "08-context-filled.png")}`);

    await clickFooterPrimary(page, "다음");
    await page.waitForTimeout(400);
    await shot(page, "09-review");
    log.push(`09-review: ${join(outDir, "09-review.png")}`);

    await clickFooterPrimary(page, "내용 확인");
    await page.waitForTimeout(300);
    await shot(page, "10-review-confirmed");
    log.push(`10-review-confirmed: ${join(outDir, "10-review-confirmed.png")}`);

    await clickFooterPrimary(page, "확인하고 시작");
    await page.waitForTimeout(1500);
    await shot(page, "11-chat-or-error");
    log.push(`11-chat-or-error: ${join(outDir, "11-chat-or-error.png")}`);

    await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="하단 내비게이션"]');
      nav?.querySelectorAll("button")?.[1]?.click();
    });
    await page.waitForTimeout(400);
    await shot(page, "12-history");
    log.push(`12-history: ${join(outDir, "12-history.png")}`);

    await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="하단 내비게이션"]');
      nav?.querySelectorAll("button")?.[2]?.click();
    });
    await page.waitForTimeout(400);
    await shot(page, "13-settings");
    log.push(`13-settings: ${join(outDir, "13-settings.png")}`);

    const tabCount = await page.evaluate(() => document.querySelectorAll('nav[aria-label="하단 내비게이션"] button').length);
    if (tabCount >= 4) {
      await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="하단 내비게이션"]');
        nav?.querySelectorAll("button")?.[3]?.click();
      });
      await page.waitForTimeout(1200);
      await shot(page, "14-admin");
      log.push(`14-admin: ${join(outDir, "14-admin.png")}`);
    } else {
      log.push("SKIP-admin: 관리 탭 없음 (비관리자 계정)");
    }

    await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="하단 내비게이션"]');
      nav?.querySelectorAll("button")?.[0]?.click();
    });
    await page.waitForTimeout(400);
    await shot(page, "15-home-logged-in");
    log.push(`15-home-logged-in: ${join(outDir, "15-home-logged-in.png")}`);
  } catch (e) {
    await shot(page, "99-error");
    log.push(`ERROR: ${e?.message || e}`);
    log.push(`99-error: ${join(outDir, "99-error.png")}`);
  } finally {
    await browser.close();
  }

  console.log(log.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
