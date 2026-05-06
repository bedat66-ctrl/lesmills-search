/**
 * NASジムのhacomono スケジュールURL発見スクリプト
 * 各NASジムの公式サイトからhacomonoのURLを探す
 * 実行方法: node scripts/find-hacomono-urls.js
 */

const { chromium } = require("playwright");

const NAS_GYMS = [
  { gymId: 1, gymName: "スポーツクラブNAS西日暮里", gymUrl: "https://www.nas-club.co.jp/club/nishinippori/" },
  { gymId: 2, gymName: "スポーツクラブNAS大崎", gymUrl: "https://www.nas-club.co.jp/club/osaki/" },
  { gymId: 3, gymName: "スポーツクラブNASリバーシティ21", gymUrl: "https://www.nas-club.co.jp/club/rivercity21/" },
  { gymId: 4, gymName: "スポーツクラブNAS西葛西", gymUrl: "https://www.nas-club.co.jp/club/nishikasai/" },
  { gymId: 5, gymName: "スポーツクラブNAS戸塚", gymUrl: "https://www.nas-club.co.jp/club/totsuka/" },
  { gymId: 6, gymName: "スポーツクラブNAS藤沢", gymUrl: "https://www.nas-club.co.jp/club/fujisawa/" },
  { gymId: 7, gymName: "スポーツクラブNAS新川崎", gymUrl: "https://www.nas-club.co.jp/club/shinkawasaki/" },
  { gymId: 8, gymName: "スポーツクラブNAS篠崎", gymUrl: "https://www.nas-club.co.jp/club/shinozaki/" },
  { gymId: 9, gymName: "スポーツクラブNAS溝の口", gymUrl: "https://www.nas-club.co.jp/club/mizonokuchi/" },
  { gymId: 10, gymName: "スポーツクラブNAS中山", gymUrl: "https://www.nas-club.co.jp/club/nakayama/" },
  { gymId: 15, gymName: "スポーツクラブNAS蕨", gymUrl: "https://www.nas-club.co.jp/club/warabi/" },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });

  const results = [];

  for (const gym of NAS_GYMS) {
    console.log(`\n🔍 ${gym.gymName}`);
    console.log(`   ${gym.gymUrl}`);

    try {
      const page = await context.newPage();
      await page.goto(gym.gymUrl, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(1000);

      // rsv.nas-club.co.jp へのリンクを全部探す
      const hacoLinks = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll("a[href]").forEach(a => {
          const href = a.href;
          if (href.includes("rsv.nas-club.co.jp") || href.includes("hacomono")) {
            links.push({ href, text: a.textContent?.trim().substring(0, 50) });
          }
        });
        return links;
      });

      if (hacoLinks.length > 0) {
        console.log(`   ✅ hacomonoリンク発見:`);
        hacoLinks.forEach(l => {
          console.log(`      ${l.href}  (${l.text})`);
        });
        results.push({ ...gym, hacoLinks });
      } else {
        // "スケジュール" や "予約" ボタンのリンクを探す
        const scheduleLinks = await page.evaluate(() => {
          const links = [];
          document.querySelectorAll("a[href]").forEach(a => {
            const text = a.textContent?.trim() || "";
            const href = a.href;
            if ((text.includes("スケジュール") || text.includes("予約") || text.includes("schedule"))
                && href && !href.includes("javascript")) {
              links.push({ href, text: text.substring(0, 50) });
            }
          });
          return links;
        });

        if (scheduleLinks.length > 0) {
          console.log(`   📋 スケジュール関連リンク:`);
          scheduleLinks.forEach(l => console.log(`      ${l.href}  (${l.text})`));
          results.push({ ...gym, scheduleLinks });
        } else {
          console.log(`   ❌ リンク見つからず`);
          results.push({ ...gym, noLinks: true });
        }
      }

      await page.close();
    } catch (e) {
      console.log(`   ⚠️ エラー: ${e.message.substring(0, 80)}`);
      results.push({ ...gym, error: e.message });
    }

    // 丁寧なアクセス: 2秒待つ
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n\n=== 結果まとめ ===");
  const fs = require("fs");
  fs.writeFileSync("data/hacomono-urls.json", JSON.stringify(results, null, 2));
  console.log("data/hacomono-urls.json に保存しました");

  await browser.close();
})();
