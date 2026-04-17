/**
 * NAS スケジュール更新スクリプト
 * hacomono-v2.json の取得結果を schedules.json に反映する
 * 実行方法: node scripts/update-nas-schedules.js
 */

const fs = require("fs");
const path = require("path");

// NAS ジムのメタデータ（住所・駅情報など）
const NAS_GYM_META = {
  1:  { chain: "NAS", prefecture: "東京都",   city: "荒川区",         address: "東京都荒川区西日暮里2-54-3",         station: "西日暮里駅", gymUrl: "https://www.nas-club.co.jp/club/nishinippori/",  reservationUrl: "https://www.nas-club.co.jp/club/nishinippori/",  mapUrl: "https://maps.google.com/?q=東京都荒川区西日暮里2-54-3" },
  2:  { chain: "NAS", prefecture: "東京都",   city: "品川区",         address: "東京都品川区大崎1-11-2",             station: "大崎駅",     gymUrl: "https://www.nas-club.co.jp/club/osaki/",         reservationUrl: "https://www.nas-club.co.jp/club/osaki/",         mapUrl: "https://maps.google.com/?q=東京都品川区大崎1-11-2" },
  3:  { chain: "NAS", prefecture: "東京都",   city: "中央区",         address: "東京都中央区佃2-2-2",                station: "月島駅",     gymUrl: "https://www.nas-club.co.jp/club/rivercity21/",   reservationUrl: "https://www.nas-club.co.jp/club/rivercity21/",   mapUrl: "https://maps.google.com/?q=東京都中央区佃2-2-2" },
  4:  { chain: "NAS", prefecture: "東京都",   city: "江戸川区",       address: "東京都江戸川区西葛西6-14-2",         station: "西葛西駅",   gymUrl: "https://www.nas-club.co.jp/club/nishikasai/",    reservationUrl: "https://www.nas-club.co.jp/club/nishikasai/",    mapUrl: "https://maps.google.com/?q=東京都江戸川区西葛西6-14-2" },
  5:  { chain: "NAS", prefecture: "神奈川県", city: "横浜市戸塚区",   address: "神奈川県横浜市戸塚区戸塚町16-1",     station: "戸塚駅",     gymUrl: "https://www.nas-club.co.jp/club/totsuka/",       reservationUrl: "https://www.nas-club.co.jp/club/totsuka/",       mapUrl: "https://maps.google.com/?q=神奈川県横浜市戸塚区戸塚町16-1" },
  6:  { chain: "NAS", prefecture: "神奈川県", city: "藤沢市",         address: "神奈川県藤沢市藤沢109",              station: "藤沢駅",     gymUrl: "https://www.nas-club.co.jp/club/fujisawa/",      reservationUrl: "https://www.nas-club.co.jp/club/fujisawa/",      mapUrl: "https://maps.google.com/?q=神奈川県藤沢市藤沢109" },
  7:  { chain: "NAS", prefecture: "神奈川県", city: "川崎市幸区",     address: "神奈川県川崎市幸区鹿島田1-1-2",     station: "新川崎駅",   gymUrl: "https://www.nas-club.co.jp/club/shinkawasaki/",  reservationUrl: "https://www.nas-club.co.jp/club/shinkawasaki/",  mapUrl: "https://maps.google.com/?q=神奈川県川崎市幸区鹿島田1-1-2" },
  8:  { chain: "NAS", prefecture: "東京都",   city: "江戸川区",       address: "東京都江戸川区篠崎町7-16-1",         station: "篠崎駅",     gymUrl: "https://www.nas-club.co.jp/club/shinozaki/",     reservationUrl: "https://www.nas-club.co.jp/club/shinozaki/",     mapUrl: "https://maps.google.com/?q=東京都江戸川区篠崎町7-16-1" },
  9:  { chain: "NAS", prefecture: "神奈川県", city: "川崎市高津区",   address: "神奈川県川崎市高津区溝口2-1-3",     station: "溝の口駅",   gymUrl: "https://www.nas-club.co.jp/club/mizonokuchi/",   reservationUrl: "https://rsv.nas-club.co.jp/reserve/schedule/134/287", mapUrl: "https://maps.google.com/?q=神奈川県川崎市高津区溝口2-1-3" },
  10: { chain: "NAS", prefecture: "神奈川県", city: "横浜市緑区",     address: "神奈川県横浜市緑区中山町219-1",     station: "中山駅",     gymUrl: "https://www.nas-club.co.jp/club/nakayama/",      reservationUrl: "https://www.nas-club.co.jp/club/nakayama/",      mapUrl: "https://maps.google.com/?q=神奈川県横浜市緑区中山町219-1" },
  15: { chain: "NAS", prefecture: "埼玉県",   city: "蕨市",           address: "埼玉県蕨市中央1-20-1",               station: "蕨駅",       gymUrl: "https://www.nas-club.co.jp/club/warabi/",        reservationUrl: "https://www.nas-club.co.jp/club/warabi/",        mapUrl: "https://maps.google.com/?q=埼玉県蕨市中央1-20-1" },
};

const dataDir = path.join(__dirname, "..", "data");
const hacomonoPath = path.join(dataDir, "hacomono-v2.json");
const schedulesPath = path.join(dataDir, "schedules.json");

// hacomono-v2.json 読み込み
if (!fs.existsSync(hacomonoPath)) {
  console.error("❌ data/hacomono-v2.json が見つかりません。先に scrape-hacomono-v2.js を実行してください。");
  process.exit(1);
}

const scraped = JSON.parse(fs.readFileSync(hacomonoPath, "utf-8"));
const existing = JSON.parse(fs.readFileSync(schedulesPath, "utf-8"));

// NAS以外のエントリを保持
const nonNas = existing.filter(s => s.chain !== "NAS");
const nasExisting = existing.filter(s => s.chain === "NAS");

// 最大IDを求める（NAS以外のエントリのIDから）
const maxNonNasId = nonNas.reduce((max, s) => Math.max(max, s.id || 0), 0);

// スクレイプ結果に gym メタデータを付与
const newNas = scraped.map((r, i) => {
  const meta = NAS_GYM_META[r.gymId] || {};
  return {
    id: maxNonNasId + i + 1,
    gymId: r.gymId,
    gymName: r.gymName,
    ...meta,
    program: r.program,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    instructor: r.instructor || "",
    note: r.note || "",
  };
});

// 差分サマリー
console.log(`既存NASエントリ: ${nasExisting.length}件`);
console.log(`新規スクレイプ: ${newNas.length}件`);

const added = newNas.filter(r => !nasExisting.find(e =>
  e.gymId === r.gymId && e.dayOfWeek === r.dayOfWeek &&
  e.startTime === r.startTime && e.program === r.program
));
const removed = nasExisting.filter(e => !newNas.find(r =>
  r.gymId === e.gymId && r.dayOfWeek === e.dayOfWeek &&
  r.startTime === e.startTime && r.program === e.program
));

if (added.length) {
  console.log(`🆕 新規 ${added.length}件:`);
  added.forEach(r => console.log(`  ${r.gymName} ${r.dayOfWeek}曜 ${r.startTime} ${r.program}`));
}
if (removed.length) {
  console.log(`❌ 削除 ${removed.length}件:`);
  removed.forEach(e => console.log(`  ${e.gymName} ${e.dayOfWeek}曜 ${e.startTime} ${e.program}`));
}
if (!added.length && !removed.length) {
  console.log("✅ 差分なし");
}

// schedules.json を更新
const updated = [...nonNas, ...newNas];
fs.writeFileSync(schedulesPath, JSON.stringify(updated, null, 2), "utf-8");
console.log(`\n✅ schedules.json を更新しました（合計${updated.length}件）`);
