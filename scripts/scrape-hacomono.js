/**
 * NAS hacomono スケジュール自動取得スクリプト
 * BODYATTACK / GRIT クラスのみ抽出してJSONで出力
 * 実行方法: node scripts/scrape-hacomono.js
 */

const { chromium } = require("playwright");
const fs = require("fs");

// hacomonoのスケジュールURL (top pageから取得)
const NAS_GYMS = [
  { gymId: 1,  gymName: "スポーツクラブNAS西日暮里",    hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/54/95" },
  { gymId: 2,  gymName: "スポーツクラブNAS大崎",        hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/152/350" },
  { gymId: 3,  gymName: "スポーツクラブNASリバーシティ21", hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/32/50" },
  { gymId: 4,  gymName: "スポーツクラブNAS西葛西",       hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/102/132" },
  { gymId: 5,  gymName: "スポーツクラブNAS戸塚",        hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/30/46" },
  { gymId: 6,  gymName: "スポーツクラブNAS藤沢",        hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/122/202" },
  { gymId: 7,  gymName: "スポーツクラブNAS新川崎",       hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/146/292" },
  { gymId: 8,  gymName: "スポーツクラブNAS篠崎",        hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/118/199" },
  { gymId: 9,  gymName: "スポーツクラブNAS溝の口",      hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/134/287" },
  { gymId: 10, gymName: "スポーツクラブNAS中山",        hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/36/60" },
  { gymId: 15, gymName: "スポーツクラブNAS蕨",          hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/155/364" },
];

// 対象プログラム
const TARGET_PROGRAMS = ["BODYATTACK", "BODY ATTACK", "GRIT"];

// 曜日マッピング (日本語→英語 for matching)
const DAY_JP = ["月", "火", "水", "木", "金", "土", "日"];
// 今週の月曜日から日曜日の日付を取得 (YYYY-MM-DD)
function getWeekDates() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=日, 1=月...
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  });
}

// 時刻文字列からhh:mm形式を抽出
function parseTime(text) {
  // "21:15 - 22:00" や "21:15-22:00" や "21:15" などのパターン
  const match = text.match(/(\d{1,2}):(\d{2})/g);
  if (!match) return null;
  return match.map(t => {
    const parts = t.split(":");
    return `${String(parts[0]).padStart(2, "0")}:${parts[1]}`;
  });
}

// プログラム名がターゲットかチェック
function isTarget(text) {
  const upper = text.toUpperCase();
  return TARGET_PROGRAMS.some(t => upper.includes(t));
}

// プログラム名を正規化
function normalizeProgram(text) {
  const upper = text.toUpperCase();
  if (upper.includes("BODYATTACK") || upper.includes("BODY ATTACK")) return "BODYATTACK";
  if (upper.includes("GRIT")) {
    if (upper.includes("CARDIO")) return "GRIT";
    if (upper.includes("STRENGTH")) return "GRIT";
    if (upper.includes("ATHLETIC")) return "GRIT";
    return "GRIT";
  }
  return text.trim();
}

// GRITのタイプを note に格納
function getGritNote(text) {
  const upper = text.toUpperCase();
  if (upper.includes("CARDIO")) return "GRIT CARDIO";
  if (upper.includes("STRENGTH")) return "GRIT STRENGTH";
  if (upper.includes("ATHLETIC")) return "GRIT ATHLETIC";
  return "";
}

async function scrapeGym(gym, browser, weekDates) {
  console.log(`\n📍 ${gym.gymName}`);
  const results = [];

  const page = await browser.newPage();

  try {
    await page.goto(gym.hacoUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // 日付ボタンを取得 (月〜日)
    const dayButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a, button")).map((el, idx) => ({
        idx,
        text: el.textContent?.trim(),
        tag: el.tagName,
        href: el.tagName === "A" ? el.href : null,
      })).filter(b => b.text && /\d+\([月火水木金土日]\)/.test(b.text));
    });

    console.log(`   Day buttons: ${dayButtons.map(b => b.text).join(", ")}`);

    if (dayButtons.length === 0) {
      console.log(`   ⚠️ 日付ボタンが見つかりません。DOM構造を確認...`);
      // ページ内のテキストを調査
      const allText = await page.evaluate(() => {
        return document.body.innerText.substring(0, 500);
      });
      console.log(`   本文: ${allText}`);
      await page.close();
      return results;
    }

    // 各曜日をクリックして授業情報を取得
    for (let dayIdx = 0; dayIdx < dayButtons.length; dayIdx++) {
      const btn = dayButtons[dayIdx];
      const dayMatch = btn.text.match(/\(([月火水木金土日])\)/);
      if (!dayMatch) continue;
      const dayOfWeek = dayMatch[1];

      // 日付ボタンをクリック
      if (btn.href) {
        await page.goto(btn.href, { waitUntil: "networkidle", timeout: 20000 });
      } else {
        const buttons = await page.$$(
          `a:has-text("${btn.text}"), button:has-text("${btn.text}")`
        );
        if (buttons.length > 0) {
          await buttons[0].click();
          await page.waitForTimeout(2000);
        }
      }
      await page.waitForTimeout(1500);

      // レッスン情報を取得
      const lessons = await page.evaluate((targetPrograms) => {
        const results = [];

        // hacomonoのレッスンカード要素を探す
        // 一般的なクラス名パターン
        const selectors = [
          "[class*='lesson']",
          "[class*='schedule']",
          "[class*='program']",
          "[class*='class']",
          "[class*='event']",
          "[class*='reserve']",
        ];

        const seen = new Set();

        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => {
            const text = el.innerText?.trim();
            if (!text || text.length < 5) return;

            // テキスト内にターゲットプログラム名があるか
            const upper = text.toUpperCase();
            const hasTarget = targetPrograms.some(t => upper.includes(t));
            if (!hasTarget) return;

            const key = text.substring(0, 60);
            if (seen.has(key)) return;
            seen.add(key);

            results.push({
              text,
              className: el.className?.substring(0, 100),
            });
          });
        }

        return results;
      }, TARGET_PROGRAMS);

      if (lessons.length > 0) {
        console.log(`   ${dayOfWeek}曜日: ${lessons.length}件のターゲットレッスン`);
        lessons.forEach(lesson => {
          console.log(`      📋 ${lesson.text.replace(/\n/g, " | ").substring(0, 100)}`);

          // テキストを解析
          const lines = lesson.text.split("\n").map(l => l.trim()).filter(Boolean);
          const times = parseTime(lesson.text);

          // プログラム名を探す
          const programLine = lines.find(l => isTarget(l));
          if (!programLine) return;

          const program = normalizeProgram(programLine);
          const note = program === "GRIT" ? getGritNote(programLine) : "";

          // インストラクター名を探す (時刻でもプログラム名でもない行)
          const instructor = lines.find(l => {
            if (!l || parseTime(l)) return false;
            if (isTarget(l)) return false;
            if (l.includes("予約") || l.includes("満員") || l.includes("受付")) return false;
            if (l.length > 20) return false;
            return true;
          }) || "";

          results.push({
            program,
            dayOfWeek,
            startTime: times?.[0] || "",
            endTime: times?.[1] || "",
            instructor: instructor.trim(),
            note,
          });
        });
      } else {
        // ターゲットなし
        process.stdout.write(`   ${dayOfWeek}`);
      }
    }
    console.log();

  } catch (e) {
    console.log(`   ❌ エラー: ${e.message.substring(0, 100)}`);
  }

  await page.close();
  return results;
}

(async () => {
  console.log("=== NAS hacomono スケジュール取得開始 ===");
  console.log("対象プログラム:", TARGET_PROGRAMS.join(", "));

  const weekDates = getWeekDates();
  console.log(`今週 (月〜日): ${weekDates[0]} 〜 ${weekDates[6]}`);

  const browser = await chromium.launch({ headless: true });

  const allResults = [];

  for (const gym of NAS_GYMS) {
    const gymResults = await scrapeGym(gym, browser, weekDates);
    gymResults.forEach(r => allResults.push({ ...gym, ...r }));
    // 丁寧なアクセス: ジム間に3秒待つ
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  await browser.close();

  console.log("\n=== 取得結果 ===");
  console.log(`合計 ${allResults.length} レッスン`);

  if (allResults.length > 0) {
    console.log("\nレッスン一覧:");
    allResults.forEach(r => {
      console.log(`  ${r.gymName} | ${r.dayOfWeek} | ${r.startTime}-${r.endTime} | ${r.program} | ${r.instructor}`);
    });
  }

  fs.writeFileSync("data/hacomono-scraped.json", JSON.stringify(allResults, null, 2));
  console.log("\ndata/hacomono-scraped.json に保存しました");

  // schedules.json との差分チェック
  const existing = JSON.parse(fs.readFileSync("data/schedules.json"));
  const nasExisting = existing.filter(s => s.chain === "NAS");

  console.log("\n=== schedules.json との比較 ===");
  console.log(`既存NASレッスン数: ${nasExisting.length}`);
  console.log(`今回取得数: ${allResults.length}`);

  // 新規・変更・削除のチェック
  const newEntries = [];
  const unchanged = [];

  allResults.forEach(r => {
    const match = nasExisting.find(e =>
      e.gymId === r.gymId &&
      e.dayOfWeek === r.dayOfWeek &&
      e.program === r.program &&
      e.startTime === r.startTime
    );

    if (!match) {
      newEntries.push(r);
    } else {
      unchanged.push(r);
    }
  });

  if (newEntries.length > 0) {
    console.log(`\n🆕 新規レッスン ${newEntries.length}件:`);
    newEntries.forEach(r => {
      console.log(`  ${r.gymName} | ${r.dayOfWeek} | ${r.startTime} | ${r.program} | ${r.instructor}`);
    });
  }

  const missing = nasExisting.filter(e => {
    return !allResults.find(r =>
      r.gymId === e.gymId &&
      r.dayOfWeek === e.dayOfWeek &&
      r.program === e.program &&
      r.startTime === e.startTime
    );
  });

  if (missing.length > 0) {
    console.log(`\n❓ schedules.jsonにあるがスクレイプで見つからないレッスン ${missing.length}件:`);
    missing.forEach(e => {
      console.log(`  ${e.gymName} | ${e.dayOfWeek} | ${e.startTime} | ${e.program} | ${e.instructor}`);
    });
  }

  if (newEntries.length === 0 && missing.length === 0) {
    console.log("✅ 差分なし - 完全一致");
  }
})();
