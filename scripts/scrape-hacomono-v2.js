/**
 * NAS スタジオスケジュール 自動取得スクリプト v3
 * DOM構造: div.day_caption (日付ヘッダー) + div.d_lesson (個別レッスン)
 * 対象プログラム: BODYATTACK / BODYCOMBAT / BODYPUMP / GRIT / BODYJAM
 * ※ 画像ロゴ表示（alt属性・src名）にも対応
 * 実行方法: node scripts/scrape-hacomono-v2.js
 */

const { chromium } = require("playwright");
const fs = require("fs");

const NAS_GYMS = [
  { gymId: 1,  gymName: "スポーツクラブNAS西日暮里",       hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/54/95" },
  { gymId: 2,  gymName: "スポーツクラブNAS大崎",           hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/152/350" },
  { gymId: 3,  gymName: "スポーツクラブNASリバーシティ21",  hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/32/50" },
  { gymId: 4,  gymName: "スポーツクラブNAS西葛西",          hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/102/132" },
  { gymId: 5,  gymName: "スポーツクラブNAS戸塚",           hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/30/46" },
  { gymId: 6,  gymName: "スポーツクラブNAS藤沢",           hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/122/202" },
  { gymId: 7,  gymName: "スポーツクラブNAS新川崎",          hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/146/292" },
  { gymId: 8,  gymName: "スポーツクラブNAS篠崎",           hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/118/199" },
  { gymId: 9,  gymName: "スポーツクラブNAS溝の口",         hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/134/287" },
  { gymId: 10, gymName: "スポーツクラブNAS中山",           hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/36/60" },
  { gymId: 15, gymName: "スポーツクラブNAS蕨",             hacoUrl: "https://rsv.nas-club.co.jp/reserve/schedule/155/364" },
];

// ターゲットプログラム（表記揺れを含む）
const TARGET_KEYWORDS = [
  "BODYATTACK", "BODY ATTACK",
  "BODYCOMBAT", "BODY COMBAT",
  "BODYPUMP",   "BODY PUMP",
  "GRIT",
  "BODYJAM",    "BODY JAM",
];

function normalizeProgram(text) {
  const u = text.toUpperCase().replace(/\s+/g, "");
  if (u.includes("BODYATTACK"))  return "BODYATTACK";
  if (u.includes("BODYCOMBAT"))  return "BODYCOMBAT";
  if (u.includes("BODYPUMP"))    return "BODYPUMP";
  if (u.includes("GRIT"))        return "GRIT";
  if (u.includes("BODYJAM"))     return "BODYJAM";
  return text.trim();
}

function getNote(program, text) {
  const u = text.toUpperCase();
  if (program === "GRIT") {
    if (u.includes("CARDIO"))   return "GRIT CARDIO";
    if (u.includes("STRENGTH")) return "GRIT STRENGTH";
    if (u.includes("ATHLETIC")) return "GRIT ATHLETIC";
  }
  if (program === "BODYPUMP") {
    if (u.includes("HEAVY")) return "BODYPUMP HEAVY";
  }
  return "";
}

function isTargetText(text) {
  const u = text.toUpperCase();
  return TARGET_KEYWORDS.some(k => u.includes(k));
}

async function scrapeGym(gym, browser) {
  console.log(`\n📍 ${gym.gymName}`);
  const results = [];
  const page = await browser.newPage();

  try {
    await page.goto(gym.hacoUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    const data = await page.evaluate((targetKeywords) => {
      const results = [];

      // ===== 曜日ヘッダーの X 座標を取得 =====
      const dayCaptions = [];
      document.querySelectorAll("div").forEach(el => {
        const text = el.textContent?.trim();
        if (!text) return;
        const match = text.match(/^(\d+)\/(\d+)\s*\(([月火水木金土日])\)$/);
        if (match) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0) {
            dayCaptions.push({
              dayOfWeek: match[3],
              x: Math.round(rect.x + rect.width / 2),
            });
          }
        }
      });

      // ===== 各レッスンを取得 =====
      document.querySelectorAll(".d_lesson").forEach(el => {
        const rect = el.getBoundingClientRect();
        const fullText = el.textContent?.trim() || "";
        const lines = fullText.split("\n").map(l => l.trim()).filter(Boolean);

        // 時刻取得 (HH:MM - HH:MM)
        const timeMatch = fullText.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
        if (!timeMatch) return;
        const startTime = `${timeMatch[1].padStart(2,"0")}:${timeMatch[2]}`;
        const endTime   = `${timeMatch[3].padStart(2,"0")}:${timeMatch[4]}`;

        // プログラム名取得（テキスト優先、画像alt/srcにも対応）
        const programEl = el.querySelector(".program-schedule-box");
        let programText = programEl?.textContent?.trim() || "";

        // テキストが空の場合は画像のalt・src名から取得（ロゴ画像対応）
        if (!programText && programEl) {
          const img = programEl.querySelector("img");
          if (img) {
            programText = img.alt?.trim()
              || img.src?.split("/").pop()?.split(".")[0]?.replace(/-/g, " ").toUpperCase()
              || "";
          }
        }
        // program-schedule-box がない場合は全テキストから推定
        if (!programText) {
          programText = lines.find(l =>
            targetKeywords.some(k => l.toUpperCase().includes(k))
          ) || "";
        }

        // ターゲットか確認
        if (!targetKeywords.some(k => programText.toUpperCase().includes(k))) return;

        // インストラクター名（短い行・時刻やプログラム名でない行）
        const instructor = lines.find(l => {
          if (!l || l.length > 20) return false;
          if (/\d:\d/.test(l)) return false;
          if (programText && l === programText) return false;
          if (targetKeywords.some(k => l.toUpperCase().includes(k))) return false;
          return true;
        }) || "";

        // X位置から最近曜日を特定
        const lessonX = Math.round(rect.x + rect.width / 2);
        let nearestDay = null, minDist = Infinity;
        dayCaptions.forEach(dc => {
          const dist = Math.abs(dc.x - lessonX);
          if (dist < minDist) { minDist = dist; nearestDay = dc; }
        });

        results.push({
          startTime, endTime, programText,
          instructor: instructor.replace(/\s+/g, " ").trim(),
          dayOfWeek: nearestDay?.dayOfWeek || "?",
          dist: Math.round(minDist),
        });
      });

      return { dayCaptions, results };
    }, TARGET_KEYWORDS);

    console.log(`   曜日取得: ${data.dayCaptions.map(d => d.dayOfWeek).join(",")}`);

    data.results.forEach(r => {
      const program = normalizeProgram(r.programText);
      const note = getNote(program, r.programText);
      console.log(`   ${r.dayOfWeek} | ${r.startTime}-${r.endTime} | ${program}${note ? " ("+note+")" : ""} | ${r.instructor}`);
      results.push({ gymId: gym.gymId, gymName: gym.gymName, program, note, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, instructor: r.instructor });
    });

    if (data.results.length === 0) console.log("   対象レッスンなし（または画像ロゴで取得不可）");

  } catch (e) {
    console.log(`   ❌ エラー: ${e.message.substring(0, 100)}`);
  }

  await page.close();
  return results;
}

(async () => {
  console.log("=== NAS スタジオスケジュール取得 v3 ===");
  console.log("対象: BODYATTACK / BODYCOMBAT / BODYPUMP / GRIT / BODYJAM\n");

  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const gym of NAS_GYMS) {
    const gymResults = await scrapeGym(gym, browser);
    allResults.push(...gymResults);
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();

  console.log(`\n=== 取得結果まとめ: 合計 ${allResults.length} レッスン ===`);
  fs.writeFileSync("data/hacomono-v2.json", JSON.stringify(allResults, null, 2));
  console.log("data/hacomono-v2.json に保存しました");

  // schedules.json との比較（参考）
  const existing = JSON.parse(fs.readFileSync("data/schedules.json"));
  const nasExisting = existing.filter(s => s.chain === "NAS");

  const newEntries = allResults.filter(r =>
    !nasExisting.find(e => e.gymId===r.gymId && e.dayOfWeek===r.dayOfWeek && e.startTime===r.startTime && e.program===r.program)
  );
  const missing = nasExisting.filter(e =>
    !allResults.find(r => r.gymId===e.gymId && r.dayOfWeek===e.dayOfWeek && r.startTime===e.startTime && r.program===e.program)
  );
  const changed = allResults.filter(r => {
    const match = nasExisting.find(e => e.gymId===r.gymId && e.dayOfWeek===r.dayOfWeek && e.startTime===r.startTime && e.program===r.program);
    return match && match.instructor && r.instructor && match.instructor !== r.instructor;
  });

  if (newEntries.length) {
    console.log(`\n🆕 新規 ${newEntries.length}件:`);
    newEntries.forEach(r => console.log(`  ${r.gymName} ${r.dayOfWeek}曜 ${r.startTime} ${r.program} ${r.instructor}`));
  }
  if (missing.length) {
    console.log(`\n❓ DBにあるがスクレイプで見つからない ${missing.length}件:`);
    missing.forEach(e => console.log(`  ${e.gymName} ${e.dayOfWeek}曜 ${e.startTime} ${e.program} ← 手動追加or画像ロゴ`));
  }
  if (changed.length) {
    console.log(`\n🔄 インストラクター変更 ${changed.length}件:`);
    changed.forEach(r => {
      const match = nasExisting.find(e => e.gymId===r.gymId && e.dayOfWeek===r.dayOfWeek && e.startTime===r.startTime && e.program===r.program);
      console.log(`  ${r.gymName} ${r.dayOfWeek}曜 ${r.startTime} ${r.program}: ${match?.instructor} → ${r.instructor}`);
    });
  }
  if (!newEntries.length && !missing.length && !changed.length) console.log("✅ 差分なし");
})();
