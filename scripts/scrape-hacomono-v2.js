/**
 * NAS hacomono スケジュール自動取得スクリプト v2
 * DOM構造: div.day_caption (日付ヘッダー) + div.d_lesson (個別レッスン)
 * 実行方法: node scripts/scrape-hacomono-v2.js
 */

const { chromium } = require("playwright");
const fs = require("fs");

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

const TARGET_PROGRAMS = ["BODYATTACK", "BODY ATTACK", "GRIT", "BODYJAM", "BODY JAM"];

function normalizeProgram(text) {
  const u = text.toUpperCase();
  if (u.includes("BODYATTACK") || u.includes("BODY ATTACK")) return "BODYATTACK";
  if (u.includes("GRIT")) return "GRIT";
  if (u.includes("BODYJAM") || u.includes("BODY JAM")) return "BODYJAM";
  return text.trim();
}

function getGritNote(text) {
  const u = text.toUpperCase();
  if (u.includes("CARDIO")) return "GRIT CARDIO";
  if (u.includes("STRENGTH")) return "GRIT STRENGTH";
  if (u.includes("ATHLETIC")) return "GRIT ATHLETIC";
  return "";
}

function isTarget(text) {
  const u = text.toUpperCase();
  return TARGET_PROGRAMS.some(t => u.includes(t));
}

// 週の月曜日から日曜日の日付を取得
function getWeekDates() {
  const today = new Date();
  const dow = today.getDay(); // 0=日,1=月...
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return { date: `${month}/${day}`, dayOfWeek: ["月","火","水","木","金","土","日"][i] };
  });
}

async function scrapeGym(gym, browser) {
  console.log(`\n📍 ${gym.gymName}`);
  const results = [];

  const page = await browser.newPage();

  try {
    await page.goto(gym.hacoUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    // DOM から全データを抽出
    const data = await page.evaluate((targetPrograms) => {
      const results = [];

      // day_caption要素（日付ヘッダー）を取得
      // 例: "4/16 (木)" → 木
      // ジムによって .day_caption クラスか、クラスなしのdivどちらかを使う
      const dayCaptions = [];
      document.querySelectorAll("div").forEach(el => {
        const text = el.textContent?.trim();
        if (!text) return;
        const match = text.match(/^(\d+)\/(\d+)\s*\(([月火水木金土日])\)$/);
        if (match) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0) {
            dayCaptions.push({
              month: parseInt(match[1]),
              day: parseInt(match[2]),
              dayOfWeek: match[3],
              x: Math.round(rect.x + rect.width / 2),
            });
          }
        }
      });

      // d_lesson要素（個別レッスン）を取得
      document.querySelectorAll(".d_lesson").forEach(el => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || "";
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

        // 時刻を取得 (HH:MM - HH:MM)
        const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
        if (!timeMatch) return;
        const startTime = `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}`;
        const endTime = `${timeMatch[3].padStart(2,'0')}:${timeMatch[4]}`;

        // プログラム名を取得 (program-schedule-box の中)
        const programEl = el.querySelector(".program-schedule-box");
        const programText = programEl?.textContent?.trim() || "";

        // ターゲットプログラムか確認
        const isTarget = targetPrograms.some(t => programText.toUpperCase().includes(t));
        if (!isTarget) return;

        // インストラクター名: 時刻行の次の行
        const instructor = lines.find(l => {
          if (!l || l.length > 20) return false;
          if (/\d:\d/.test(l)) return false; // 時刻行は除外
          if (l === programText) return false; // プログラム名は除外
          return true;
        }) || "";

        // X位置から曜日を特定
        const lessonX = Math.round(rect.x + rect.width / 2);
        let nearestDay = null;
        let minDist = Infinity;
        dayCaptions.forEach(dc => {
          const dist = Math.abs(dc.x - lessonX);
          if (dist < minDist) {
            minDist = dist;
            nearestDay = dc;
          }
        });

        results.push({
          startTime,
          endTime,
          programText,
          instructor: instructor.replace(/\s+/g, " ").trim(),
          dayOfWeek: nearestDay?.dayOfWeek || "?",
          lessonX,
          nearestDayX: nearestDay?.x,
          dist: Math.round(minDist),
        });
      });

      return { dayCaptions, results };
    }, TARGET_PROGRAMS);

    console.log(`   day_captions: ${data.dayCaptions.map(d => `${d.dayOfWeek}(x=${d.x})`).join(', ')}`);

    if (data.results.length === 0) {
      console.log("   対象レッスンなし");
    }

    data.results.forEach(r => {
      const program = normalizeProgram(r.programText);
      const note = program === "GRIT" ? getGritNote(r.programText) : "";
      console.log(`   ${r.dayOfWeek} | ${r.startTime}-${r.endTime} | ${program} | ${r.instructor} | [dist:${r.dist}]`);
      results.push({
        gymId: gym.gymId,
        gymName: gym.gymName,
        program,
        note,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        instructor: r.instructor,
      });
    });

  } catch (e) {
    console.log(`   ❌ エラー: ${e.message.substring(0, 100)}`);
  }

  await page.close();
  return results;
}

(async () => {
  console.log("=== NAS hacomono スケジュール取得 v2 ===");

  const weekDates = getWeekDates();
  console.log(`今週: ${weekDates.map(d => `${d.date}(${d.dayOfWeek})`).join(' ')}`);

  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const gym of NAS_GYMS) {
    const gymResults = await scrapeGym(gym, browser);
    allResults.push(...gymResults);
    await new Promise(r => setTimeout(r, 3000)); // 3秒待つ
  }

  await browser.close();

  console.log("\n=== 取得結果まとめ ===");
  console.log(`合計 ${allResults.length} レッスン`);

  fs.writeFileSync("data/hacomono-v2.json", JSON.stringify(allResults, null, 2));
  console.log("data/hacomono-v2.json に保存しました");

  // schedules.json との比較
  const existing = JSON.parse(fs.readFileSync("data/schedules.json"));
  const nasExisting = existing.filter(s => s.chain === "NAS");

  console.log(`\n既存NASレッスン数: ${nasExisting.length}`);
  console.log(`今回取得数: ${allResults.length}`);

  // 新規（hacomonoにあるがschedules.jsonにない）
  const newEntries = allResults.filter(r =>
    !nasExisting.find(e =>
      e.gymId === r.gymId &&
      e.dayOfWeek === r.dayOfWeek &&
      e.startTime === r.startTime &&
      e.program === r.program
    )
  );

  // 消えた（schedules.jsonにあるがhacomonoにない）
  const missing = nasExisting.filter(e =>
    !allResults.find(r =>
      r.gymId === e.gymId &&
      r.dayOfWeek === e.dayOfWeek &&
      r.startTime === e.startTime &&
      r.program === e.program
    )
  );

  // インストラクター変更
  const changed = allResults.filter(r => {
    const match = nasExisting.find(e =>
      e.gymId === r.gymId &&
      e.dayOfWeek === r.dayOfWeek &&
      e.startTime === r.startTime &&
      e.program === r.program
    );
    return match && match.instructor && r.instructor && match.instructor !== r.instructor;
  });

  if (newEntries.length > 0) {
    console.log(`\n🆕 新規 ${newEntries.length}件:`);
    newEntries.forEach(r => console.log(`  ${r.gymName} | ${r.dayOfWeek} | ${r.startTime} | ${r.program} | ${r.instructor}`));
  }

  if (missing.length > 0) {
    console.log(`\n❓ スクレイプで見つからない ${missing.length}件:`);
    missing.forEach(e => console.log(`  ${e.gymName} | ${e.dayOfWeek} | ${e.startTime} | ${e.program} | ${e.instructor}`));
  }

  if (changed.length > 0) {
    console.log(`\n🔄 インストラクター変更 ${changed.length}件:`);
    changed.forEach(r => {
      const match = nasExisting.find(e =>
        e.gymId === r.gymId && e.dayOfWeek === r.dayOfWeek &&
        e.startTime === r.startTime && e.program === r.program
      );
      console.log(`  ${r.gymName} | ${r.dayOfWeek} | ${r.startTime} | ${r.program}`);
      console.log(`    旧: ${match?.instructor} → 新: ${r.instructor}`);
    });
  }

  if (newEntries.length === 0 && missing.length === 0 && changed.length === 0) {
    console.log("✅ 差分なし");
  }
})();
