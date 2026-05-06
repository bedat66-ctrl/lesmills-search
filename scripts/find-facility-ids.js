/**
 * hacomonoのファシリティID発見スクリプト
 * rsv.nas-club.co.jp のAPIからジムIDを取得する
 * 実行方法: node scripts/find-facility-ids.js
 */

const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });

  const apiCalls = [];
  const page = await context.newPage();

  // 全APIコールを記録
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("nas-club") || url.includes("hacomono")) {
      apiCalls.push({ type: "request", method: req.method(), url: url.substring(0, 150) });
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] || "";
    if ((url.includes("nas-club") || url.includes("hacomono")) && ct.includes("application/json")) {
      try {
        const body = await res.json();
        const str = JSON.stringify(body);
        apiCalls.push({ type: "json_response", url: url.substring(0, 150), preview: str.substring(0, 300) });
        console.log(`\n📦 JSON: ${url.substring(0, 120)}`);
        console.log(`   ${str.substring(0, 200)}`);
      } catch (_) {}
    }
  });

  // まずトップページを見る
  console.log("=== トップページ ===");
  await page.goto("https://rsv.nas-club.co.jp/", { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  const topLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a[href]"))
      .map(a => ({ href: a.href, text: a.textContent?.trim().substring(0, 30) }))
      .filter(l => l.href.includes("nas-club"))
      .slice(0, 20);
  });
  console.log("リンク:", JSON.stringify(topLinks, null, 2));

  // /reserve/schedule を試す
  console.log("\n=== /reserve/schedule ===");
  await page.goto("https://rsv.nas-club.co.jp/reserve/schedule", { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(2000);

  const scheduleUrl = page.url();
  console.log("リダイレクト先:", scheduleUrl);

  // ページ内のクラブ選択肢を探す
  const facilityOptions = await page.evaluate(() => {
    const items = [];
    // select要素
    document.querySelectorAll("select option").forEach(opt => {
      if (opt.value) items.push({ value: opt.value, text: opt.textContent?.trim() });
    });
    // リンク内のschedule URL
    document.querySelectorAll("a[href*='/reserve/schedule/']").forEach(a => {
      items.push({ href: a.href, text: a.textContent?.trim().substring(0, 30) });
    });
    return items.slice(0, 30);
  });
  console.log("facility options:", JSON.stringify(facilityOptions, null, 2));

  // 既知の西日暮里ページで全APIコールをキャプチャ
  console.log("\n=== 西日暮里スケジュールページ ===");
  await page.goto("https://rsv.nas-club.co.jp/reserve/schedule/54/95", { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(3000);

  // ジム選択メニューを探す
  const gymSelector = await page.evaluate(() => {
    const items = [];
    // ナビゲーションやサイドバーのリンク
    document.querySelectorAll("nav a, aside a, [class*='club'] a, [class*='gym'] a, [class*='facility'] a").forEach(a => {
      if (a.href.includes("schedule")) {
        items.push({ href: a.href, text: a.textContent?.trim().substring(0, 40) });
      }
    });
    // schedule URLを含む全リンク
    document.querySelectorAll("a[href*='/reserve/schedule/']").forEach(a => {
      items.push({ href: a.href, text: a.textContent?.trim().substring(0, 40) });
    });
    return [...new Map(items.map(i => [i.href, i])).values()].slice(0, 30);
  });
  console.log("gym selector links:", JSON.stringify(gymSelector, null, 2));

  // ページのURL変化を観察してクラブ選択ボタンをクリック
  const clubButtons = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll("button, [role='button'], [class*='club'], [class*='gym'], [class*='facility']").forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 0 && text.length < 30) {
        items.push({ tag: el.tagName, text, class: el.className?.substring(0, 60) });
      }
    });
    return items.slice(0, 20);
  });
  console.log("\nクラブ関連ボタン:", JSON.stringify(clubButtons, null, 2));

  console.log("\n=== 記録したAPIコール ===");
  apiCalls.forEach(c => {
    if (c.type === "json_response") {
      console.log(`📦 ${c.url}`);
      console.log(`   ${c.preview}`);
    }
  });

  fs.writeFileSync("data/api-calls.json", JSON.stringify(apiCalls, null, 2));
  console.log("\ndata/api-calls.json に保存しました");

  await browser.close();
})();
