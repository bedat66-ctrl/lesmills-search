/**
 * NAS スケジュール更新スクリプト
 * hacomono-v2.json の取得結果を schedules.json に反映する
 *
 * マージ戦略:
 *   - スクレイプで取得できたクラス → 最新データで更新（インストラクター変更も反映）
 *   - manual: true の目印付きクラス → スクレイプに無くても保持（意図的な手動追加）
 *   - 目印なしでスクレイプに無いクラス:
 *       - そのジムのその曜日がページに表示されていた → 廃止されたものとして削除
 *       - その曜日がページに表示されていなかった（予約期間外）→ 確認できないので保持・報告
 *   - スクレイプにあってDBに無いクラス → 新規追加
 *
 * 手動でクラスを追加したい場合は、schedules.json のエントリに "manual": true を付けること。
 *
 * 実行方法: node scripts/update-nas-schedules.js
 */

const fs = require("fs");
const path = require("path");

const NAS_GYM_META = {
  1:  { chain: "NAS", prefecture: "東京都",   city: "荒川区",       address: "東京都荒川区西日暮里2-54-3",       station: "西日暮里駅", gymUrl: "https://www.nas-club.co.jp/club/nishinippori/",  reservationUrl: "https://www.nas-club.co.jp/club/nishinippori/",  mapUrl: "https://maps.google.com/?q=東京都荒川区西日暮里2-54-3" },
  2:  { chain: "NAS", prefecture: "東京都",   city: "品川区",       address: "東京都品川区大崎1-11-2",           station: "大崎駅",     gymUrl: "https://www.nas-club.co.jp/club/osaki/",         reservationUrl: "https://www.nas-club.co.jp/club/osaki/",         mapUrl: "https://maps.google.com/?q=東京都品川区大崎1-11-2" },
  3:  { chain: "NAS", prefecture: "東京都",   city: "中央区",       address: "東京都中央区佃2-2-2",              station: "月島駅",     gymUrl: "https://www.nas-club.co.jp/club/rivercity21/",   reservationUrl: "https://www.nas-club.co.jp/club/rivercity21/",   mapUrl: "https://maps.google.com/?q=東京都中央区佃2-2-2" },
  4:  { chain: "NAS", prefecture: "東京都",   city: "江戸川区",     address: "東京都江戸川区西葛西6-14-2",       station: "西葛西駅",   gymUrl: "https://www.nas-club.co.jp/club/nishikasai/",    reservationUrl: "https://www.nas-club.co.jp/club/nishikasai/",    mapUrl: "https://maps.google.com/?q=東京都江戸川区西葛西6-14-2" },
  5:  { chain: "NAS", prefecture: "神奈川県", city: "横浜市戸塚区", address: "神奈川県横浜市戸塚区戸塚町16-1",   station: "戸塚駅",     gymUrl: "https://www.nas-club.co.jp/club/totsuka/",       reservationUrl: "https://www.nas-club.co.jp/club/totsuka/",       mapUrl: "https://maps.google.com/?q=神奈川県横浜市戸塚区戸塚町16-1" },
  6:  { chain: "NAS", prefecture: "神奈川県", city: "藤沢市",       address: "神奈川県藤沢市藤沢109",            station: "藤沢駅",     gymUrl: "https://www.nas-club.co.jp/club/fujisawa/",      reservationUrl: "https://www.nas-club.co.jp/club/fujisawa/",      mapUrl: "https://maps.google.com/?q=神奈川県藤沢市藤沢109" },
  7:  { chain: "NAS", prefecture: "神奈川県", city: "川崎市幸区",   address: "神奈川県川崎市幸区鹿島田1-1-2",   station: "新川崎駅",   gymUrl: "https://www.nas-club.co.jp/club/shinkawasaki/",  reservationUrl: "https://www.nas-club.co.jp/club/shinkawasaki/",  mapUrl: "https://maps.google.com/?q=神奈川県川崎市幸区鹿島田1-1-2" },
  8:  { chain: "NAS", prefecture: "東京都",   city: "江戸川区",     address: "東京都江戸川区篠崎町7-16-1",       station: "篠崎駅",     gymUrl: "https://www.nas-club.co.jp/club/shinozaki/",     reservationUrl: "https://www.nas-club.co.jp/club/shinozaki/",     mapUrl: "https://maps.google.com/?q=東京都江戸川区篠崎町7-16-1" },
  9:  { chain: "NAS", prefecture: "神奈川県", city: "川崎市高津区", address: "神奈川県川崎市高津区溝口2-1-3",   station: "溝の口駅",   gymUrl: "https://www.nas-club.co.jp/club/mizonokuchi/",   reservationUrl: "https://rsv.nas-club.co.jp/reserve/schedule/134/287", mapUrl: "https://maps.google.com/?q=神奈川県川崎市高津区溝口2-1-3" },
  10: { chain: "NAS", prefecture: "神奈川県", city: "横浜市緑区",   address: "神奈川県横浜市緑区中山町219-1",   station: "中山駅",     gymUrl: "https://www.nas-club.co.jp/club/nakayama/",      reservationUrl: "https://www.nas-club.co.jp/club/nakayama/",      mapUrl: "https://maps.google.com/?q=神奈川県横浜市緑区中山町219-1" },
  15: { chain: "NAS", prefecture: "埼玉県",   city: "蕨市",         address: "埼玉県蕨市中央1-20-1",             station: "蕨駅",       gymUrl: "https://www.nas-club.co.jp/club/warabi/",        reservationUrl: "https://www.nas-club.co.jp/club/warabi/",        mapUrl: "https://maps.google.com/?q=埼玉県蕨市中央1-20-1" },
};

const dataDir      = path.join(__dirname, "..", "data");
const hacomonoPath = path.join(dataDir, "hacomono-v2.json");
const metaPath     = path.join(dataDir, "hacomono-v2-meta.json");
const schedulesPath = path.join(dataDir, "schedules.json");

if (!fs.existsSync(hacomonoPath)) {
  console.error("❌ data/hacomono-v2.json が見つかりません。先に scrape-hacomono-v2.js を実行してください。");
  process.exit(1);
}

const scraped  = JSON.parse(fs.readFileSync(hacomonoPath, "utf-8"));
const existing = JSON.parse(fs.readFileSync(schedulesPath, "utf-8"));

// 表示されていた曜日の記録（無い場合は安全側に倒して削除を行わない）
const visibleDaysByGym = fs.existsSync(metaPath)
  ? JSON.parse(fs.readFileSync(metaPath, "utf-8")).visibleDaysByGym || {}
  : {};
if (!Object.keys(visibleDaysByGym).length) {
  console.warn("⚠️  hacomono-v2-meta.json が無いため、削除判定をスキップします（保持のみ）。");
}
const dayVisible = e => (visibleDaysByGym[e.gymId] || []).includes(e.dayOfWeek);

const nonNas      = existing.filter(s => s.chain !== "NAS");
const nasExisting = existing.filter(s => s.chain === "NAS");

// スクレイプ結果にジムメタデータを付与
const scrapedWithMeta = scraped.map(r => {
  const meta = NAS_GYM_META[r.gymId] || {};
  return { gymId: r.gymId, gymName: r.gymName, ...meta, program: r.program, dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, instructor: r.instructor || "", note: r.note || "" };
});

const key = e => `${e.gymId}|${e.dayOfWeek}|${e.startTime}|${e.program}`;

const scrapedKeys  = new Set(scrapedWithMeta.map(key));
const existingKeys = new Set(nasExisting.map(key));

// ===== マージ =====
// 1. スクレイプ取得クラス（インストラクター最新化）
const merged = scrapedWithMeta.map(r => {
  const prev = nasExisting.find(e => key(e) === key(r));
  return prev
    ? { ...prev, manual: undefined, instructor: r.instructor || prev.instructor, note: r.note || prev.note }  // 既存を更新（スクレイプで取れる＝manual不要）
    : r;  // 新規
});

// 2. スクレイプに無いクラスの仕分け
//    manual: true → 意図的な手動追加として保持
//    曜日が表示されていた → 廃止されたクラスとして削除
//    曜日が表示されていなかった（予約期間外）→ 確認できないので保持
const notInScrape = nasExisting.filter(e => !scrapedKeys.has(key(e)));
const manual     = notInScrape.filter(e => e.manual === true);
const removed    = notInScrape.filter(e => e.manual !== true && dayVisible(e));
const unverified = notInScrape.filter(e => e.manual !== true && !dayVisible(e));

const newNas = [...merged, ...manual, ...unverified].map(e => {
  if (e.manual === undefined) { const { manual: _m, ...rest } = e; return rest; }
  return e;
});

// ===== 差分レポート =====
console.log(`既存NASエントリ:   ${nasExisting.length}件`);
console.log(`スクレイプ取得:    ${scrapedWithMeta.length}件`);
console.log(`手動追加(保持):    ${manual.length}件`);
console.log(`未確認(保持):      ${unverified.length}件`);
console.log(`削除(公式に無し):  ${removed.length}件`);

const added = scrapedWithMeta.filter(r => !existingKeys.has(key(r)));
const instrChanged = scrapedWithMeta.filter(r => {
  const prev = nasExisting.find(e => key(e) === key(r));
  return prev && prev.instructor && r.instructor && prev.instructor !== r.instructor;
});

if (manual.length) {
  console.log(`\nℹ️  手動追加として保持 ${manual.length}件:`);
  manual.forEach(e => console.log(`  ${e.gymName} ${e.dayOfWeek}曜 ${e.startTime} ${e.program} ${e.instructor}`));
}
if (unverified.length) {
  console.log(`\n👀 未確認・保持（予約ページの表示期間外で確認できず） ${unverified.length}件:`);
  unverified.forEach(e => console.log(`  ${e.gymName} ${e.dayOfWeek}曜 ${e.startTime} ${e.program} ${e.instructor}`));
}
if (removed.length) {
  console.log(`\n🗑  削除（公式スケジュールに存在しない） ${removed.length}件:`);
  removed.forEach(e => console.log(`  ${e.gymName} ${e.dayOfWeek}曜 ${e.startTime} ${e.program} ${e.instructor}`));
}
if (added.length) {
  console.log(`\n🆕 新規追加 ${added.length}件:`);
  added.forEach(r => console.log(`  ${r.gymName} ${r.dayOfWeek}曜 ${r.startTime} ${r.program} ${r.instructor}`));
}
if (instrChanged.length) {
  console.log(`\n🔄 インストラクター更新 ${instrChanged.length}件:`);
  instrChanged.forEach(r => {
    const prev = nasExisting.find(e => key(e) === key(r));
    console.log(`  ${r.gymName} ${r.dayOfWeek}曜 ${r.startTime} ${r.program}: ${prev?.instructor} → ${r.instructor}`);
  });
}
if (!added.length && !instrChanged.length && !removed.length) {
  console.log("✅ 差分なし");
}

// schedules.json を更新
const updated = [...nonNas, ...newNas];
fs.writeFileSync(schedulesPath, JSON.stringify(updated, null, 2), "utf-8");
console.log(`\n✅ schedules.json を更新しました（合計${updated.length}件）`);
