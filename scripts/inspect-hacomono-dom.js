/**
 * hacomonoのDOM構造を詳しく調査するスクリプト
 * 実行方法: node scripts/inspect-hacomono-dom.js
 */

const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // APIコールをキャプチャ
  const apiCalls = [];
  page.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] || "";
    if (ct.includes("application/json") && url.includes("nas-club")) {
      try {
        const body = await res.json();
        const str = JSON.stringify(body);
        if (str.length > 100) {
          apiCalls.push({ url: url.substring(0, 150), preview: str.substring(0, 500) });
        }
      } catch (_) {}
    }
  });

  await page.goto("https://rsv.nas-club.co.jp/reserve/schedule/54/95", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log("=== APIコール ===");
  apiCalls.forEach(c => {
    console.log(`URL: ${c.url}`);
    console.log(`Data: ${c.preview}`);
    console.log();
  });

  // テーブル構造を調査
  const tableInfo = await page.evaluate(() => {
    const info = {
      tables: [],
      columns: [],
      lessonElements: [],
    };

    // table要素
    document.querySelectorAll("table").forEach((t, i) => {
      info.tables.push({
        index: i,
        class: t.className?.substring(0, 60),
        rows: t.rows?.length,
        innerText: t.innerText?.substring(0, 100),
      });
    });

    // thead/th（日付ヘッダーを探す）
    document.querySelectorAll("th").forEach((th, i) => {
      const text = th.textContent?.trim();
      if (text && text.length > 0) {
        info.columns.push({
          index: i,
          text: text.substring(0, 40),
          class: th.className?.substring(0, 60),
          dataAttrs: JSON.stringify(th.dataset),
        });
      }
    });

    // 曜日/日付ヘッダーを含む要素
    const dayHeaders = [];
    document.querySelectorAll("[class*='header'], [class*='head'], [class*='date'], [class*='day']").forEach(el => {
      const text = el.textContent?.trim();
      if (text && /[月火水木金土日]/.test(text) && text.length < 30) {
        dayHeaders.push({ tag: el.tagName, text, class: el.className?.substring(0, 60) });
      }
    });
    info.dayHeaders = dayHeaders.slice(0, 20);

    // [class*="lesson"]要素の構造を詳しく調べる
    document.querySelectorAll("[class*='lesson']").forEach((el, i) => {
      if (i > 30) return;
      const text = el.textContent?.trim();
      const rect = el.getBoundingClientRect();
      info.lessonElements.push({
        index: i,
        tag: el.tagName,
        class: el.className?.substring(0, 80),
        text: text?.substring(0, 60),
        textLen: text?.length,
        childCount: el.children?.length,
        dataAttrs: JSON.stringify(el.dataset),
        position: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        parentClass: el.parentElement?.className?.substring(0, 60),
      });
    });

    return info;
  });

  console.log("=== テーブル ===");
  tableInfo.tables.forEach(t => console.log(JSON.stringify(t)));

  console.log("\n=== カラムヘッダー (th) ===");
  tableInfo.columns.forEach(c => console.log(JSON.stringify(c)));

  console.log("\n=== 曜日ヘッダー ===");
  tableInfo.dayHeaders?.forEach(h => console.log(JSON.stringify(h)));

  console.log("\n=== lesson要素の詳細 ===");
  tableInfo.lessonElements.forEach(l => console.log(JSON.stringify(l)));

  // 特定のtargetプログラムの要素を探す
  const targetElements = await page.evaluate(() => {
    const results = [];
    const TARGETS = ["BODYATTACK", "GRIT"];

    // テキストがBODYATTACKまたはGRITを含む最小の要素を探す
    function findLeafElements(el) {
      const text = el.textContent?.trim() || "";
      const upper = text.toUpperCase();
      const hasTarget = TARGETS.some(t => upper.includes(t));
      if (!hasTarget) return;

      // 子要素がターゲットを含むかチェック
      let childHasTarget = false;
      for (const child of el.children) {
        if (TARGETS.some(t => (child.textContent?.toUpperCase() || "").includes(t))) {
          childHasTarget = true;
          break;
        }
      }

      if (!childHasTarget || text.length < 150) {
        const rect = el.getBoundingClientRect();
        results.push({
          tag: el.tagName,
          class: el.className?.substring(0, 80),
          text: text.replace(/\n/g, " | ").substring(0, 80),
          textLen: text.length,
          dataAttrs: JSON.stringify(el.dataset),
          pos: { x: Math.round(rect.x), y: Math.round(rect.y) },
          parentClass: el.parentElement?.className?.substring(0, 60),
          grandParentClass: el.parentElement?.parentElement?.className?.substring(0, 60),
        });
      }
    }

    document.querySelectorAll("*").forEach(el => findLeafElements(el));

    // 重複排除
    const seen = new Set();
    return results.filter(r => {
      const key = r.text.substring(0, 30) + r.class.substring(0, 20);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 30);
  });

  console.log("\n=== BODYATTACK/GRIT の最小要素 ===");
  targetElements.forEach(e => console.log(JSON.stringify(e)));

  fs.writeFileSync("data/dom-inspection.json", JSON.stringify({
    tableInfo,
    targetElements,
    apiCalls,
  }, null, 2));

  console.log("\ndata/dom-inspection.json に保存しました");
  await browser.close();
})();
