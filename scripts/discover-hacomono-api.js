/**
 * hacomono スケジュールデータ取得スクリプト（スクリーンショット付き）
 * 実行方法: node scripts/discover-hacomono-api.js
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const TARGET_URL = "https://rsv.nas-club.co.jp/reserve/schedule/54/95";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  const jsonResponses = [];

  page.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] || "";
    if (ct.includes("application/json") && res.status() === 200 && url.includes("nas-club")) {
      try {
        const body = await res.json();
        const str = JSON.stringify(body);
        jsonResponses.push({ url, data: body });
        console.log(`\n📦 JSON: ${url.substring(0, 100)}`);
        console.log("   データ:", str.substring(0, 200));
      } catch (_) {}
    }
  });

  console.log("ページにアクセス中...");
  await page.goto(TARGET_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // スクリーンショット保存
  const ssDir = path.join(__dirname, "../data");
  await page.screenshot({ path: path.join(ssDir, "hacomono-screenshot.png"), fullPage: false });
  console.log("📸 スクリーンショット保存: data/hacomono-screenshot.png");

  // ページのテキスト内容確認
  const allText = await page.evaluate(() => {
    // スケジュール関連の要素を探す
    const items = [];
    document.querySelectorAll('[class*="lesson"], [class*="schedule"], [class*="class"], [class*="program"]').forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length > 2 && text.length < 100) items.push(text);
    });
    return items.slice(0, 30);
  });
  console.log("\n📋 スケジュール関連テキスト:");
  allText.forEach(t => console.log("  -", t));

  // クリック可能な要素（タブ・ボタン）を探す
  const clickables = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('button, a, [role="tab"], [class*="tab"]').forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length > 0 && text.length < 30) {
        items.push({ tag: el.tagName, text, class: el.className?.substring(0, 50) });
      }
    });
    return items.slice(0, 20);
  });
  console.log("\n🖱️ ページ内のボタン/タブ:");
  clickables.forEach(c => console.log(`  [${c.tag}] "${c.text}" (${c.class})`));

  // 「レッスン」か「スケジュール」のタブをクリックして再試行
  const lessonTab = await page.$('text=レッスン').catch(() => null)
    || await page.$('text=スケジュール').catch(() => null)
    || await page.$('[class*="lesson"]').catch(() => null);

  if (lessonTab) {
    console.log("\n▶ レッスンタブをクリック...");
    await lessonTab.click();
    await page.waitForTimeout(5000);
  }

  console.log("\n✅ 完了");
  await browser.close();
})();
