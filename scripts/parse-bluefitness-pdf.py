"""
BlueFitness VRクラス PDFスケジュール抽出・更新スクリプト
対象: BODYATTACK / BODYCOMBAT / BODYPUMP / GRIT / BODYJAM

機能:
  - PDFから VIRTUALクラスのみ抽出（有人LIVEクラスは自動除外）
  - schedules.json の BlueFitness 分を最新PDFで更新
  - 手動追加データ（PDFにないが正規クラス）は保持

使い方:
  手動確認: python3 scripts/parse-bluefitness-pdf.py
  自動更新: python3 scripts/parse-bluefitness-pdf.py --auto  (GitHub Actions用)
"""

import pdfplumber
import re
import json
import os
import sys
import urllib.request
import tempfile

# ===== 設定 =====
AUTO_MODE = "--auto" in sys.argv

PDF_GYMS = [
    {
        "url": "https://www.blue-fitness24.com/kiyosumishirakawa_lp/images/schedule.pdf",
        "gymId": 11,
        "gymName": "BLUE FITNESS 24＋studio 清澄白河",
        "chain": "BlueFitness",
        "prefecture": "東京都",
        "city": "江東区",
        "address": "東京都江東区白河1-1-6",
        "station": "清澄白河駅",
        "gymUrl": "https://www.blue-fitness24.com/kiyosumishirakawa_lp/",
        "mapUrl": "https://maps.google.com/?q=東京都江東区白河1-1-6",
    },
    {
        "url": "https://www.blue-fitness24.com/kachidoki/images/schedule.pdf",
        "gymId": 12,
        "gymName": "BLUE FITNESS 24＋studio 勝どき",
        "chain": "BlueFitness",
        "prefecture": "東京都",
        "city": "中央区",
        "address": "東京都中央区勝どき3-13-1",
        "station": "勝どき駅",
        "gymUrl": "https://www.blue-fitness24.com/kachidoki/",
        "mapUrl": "https://maps.google.com/?q=東京都中央区勝どき3-13-1",
    },
    {
        "url": "https://www.blue-fitness24.com/kayabacho-shinkawa_lp/images/schedule.pdf",
        "gymId": 13,
        "gymName": "BLUE FITNESS 24＋studio 茅場町・新川",
        "chain": "BlueFitness",
        "prefecture": "東京都",
        "city": "中央区",
        "address": "東京都中央区新川1-3-6",
        "station": "茅場町駅",
        "gymUrl": "https://www.blue-fitness24.com/kayabacho-shinkawa_lp/",
        "mapUrl": "https://maps.google.com/?q=東京都中央区新川1-3-6",
    },
    {
        "url": "https://www.blue-fitness24.com/mizue_lp/images/schedule.pdf",
        "gymId": 14,
        "gymName": "BLUE FITNESS 24＋studio 瑞江",
        "chain": "BlueFitness",
        "prefecture": "東京都",
        "city": "江戸川区",
        "address": "東京都江戸川区瑞江1-8-12",
        "station": "瑞江駅",
        "gymUrl": "https://www.blue-fitness24.com/mizue_lp/",
        "mapUrl": "https://maps.google.com/?q=東京都江戸川区瑞江1-8-12",
    },
]

DAY_LABELS = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"]
DAY_SHORT  = ["月",     "火",     "水",     "木",     "金",     "土",     "日"]
TARGET_PROGRAMS = ["BODYATTACK", "BODYCOMBAT", "BODYPUMP", "GRIT", "BODYJAM"]

TIME_PAT    = re.compile(r"(\d{1,2}):(\d{2})\s*[～~]\s*(\d{1,2}):(\d{2})")
JAPANESE_PAT = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")


def normalize_program(text):
    u = text.upper().replace(" ", "")
    for p in TARGET_PROGRAMS:
        if p in u:
            return p
    return None

def get_grit_note(text):
    u = text.upper()
    if "CARDIO" in u:   return "GRIT CARDIO"
    if "STRENGTH" in u: return "GRIT STRENGTH"
    if "ATHLETIC" in u: return "GRIT ATHLETIC"
    return ""

def is_instructor_name(line):
    """
    有人クラスのインストラクター名か判定する。
    - 短い日本語テキスト（≤10文字）→ インストラクター名
    - 長い日本語テキスト（>10文字）→ フッターや説明文（除外しない）
    - 英語の短い名前（≤10文字）→ インストラクター名
    """
    if JAPANESE_PAT.search(line):
        return len(line) <= 10
    if re.match(r'^[A-Z][a-zA-Z\s.]{1,9}$', line) and not normalize_program(line):
        return True
    return False


def extract_column_lessons(col_text, day):
    """
    列テキストから VIRTUALクラスのみ抽出。
    インストラクター名が続く場合は有人クラスとして除外。
    """
    lessons = []
    lines = [l.strip() for l in col_text.split("\n") if l.strip()]

    i = 0
    while i < len(lines):
        tm = TIME_PAT.search(lines[i])
        if tm:
            start = f"{int(tm.group(1)):02d}:{tm.group(2)}"
            end   = f"{int(tm.group(3)):02d}:{tm.group(4)}"

            # 次の行からプログラム名を探す（最大3行先）
            program = None
            program_idx = None
            note = ""
            for j in range(i + 1, min(i + 4, len(lines))):
                if TIME_PAT.search(lines[j]):
                    break
                # 単行チェック
                p = normalize_program(lines[j])
                if p:
                    program = p
                    program_idx = j
                    if p == "GRIT":
                        note = get_grit_note(lines[j])
                    break
                # 次行と結合チェック（"BODYA"+"TTACK" のような改行分割に対応）
                if j + 1 < len(lines) and not TIME_PAT.search(lines[j + 1]):
                    combined = lines[j] + lines[j + 1]
                    p = normalize_program(combined)
                    if p:
                        program = p
                        program_idx = j + 1
                        if p == "GRIT":
                            note = get_grit_note(combined)
                        break

            if program is None:
                i += 1
                continue

            # プログラム名の次行にインストラクター名 → 有人クラス（除外）
            is_live = False
            next_idx = program_idx + 1
            if next_idx < len(lines):
                next_line = lines[next_idx]
                if not TIME_PAT.search(next_line) and is_instructor_name(next_line):
                    is_live = True

            if not is_live:
                lessons.append({
                    "dayOfWeek": day,
                    "startTime": start,
                    "endTime":   end,
                    "program":   program,
                    "note":      note,
                })

        i += 1

    return lessons


def extract_from_pdf(pdf_path, gym):
    """PDFから全曜日のVIRTUALクラスを抽出"""
    results = []
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        words = page.extract_words()
        page_height = page.height
        TIME_AXIS_RIGHT = 45

        # 曜日ヘッダーの中心x座標を取得
        day_x = {}
        for w in words:
            for i, label in enumerate(DAY_LABELS):
                if w["text"] == label:
                    day_x[DAY_SHORT[i]] = (w["x0"] + w["x1"]) / 2

        if len(day_x) < 7:
            print(f"  ⚠️ 曜日ヘッダーが{len(day_x)}つしか取得できませんでした")

        sorted_days = sorted(day_x.items(), key=lambda kv: kv[1])

        for idx, (day, cx) in enumerate(sorted_days):
            x0 = max((sorted_days[idx-1][1] + cx) / 2, TIME_AXIS_RIGHT) if idx > 0 else max(cx - 35, TIME_AXIS_RIGHT)
            x1 = (cx + sorted_days[idx+1][1]) / 2 if idx < len(sorted_days) - 1 else cx + 35

            cropped = page.within_bbox((x0, 35, x1, page_height))
            col_text = cropped.extract_text() or ""
            lessons = extract_column_lessons(col_text, day)

            for lesson in lessons:
                results.append({
                    "gymId":      gym["gymId"],
                    "gymName":    gym["gymName"],
                    "chain":      gym["chain"],
                    "dayOfWeek":  lesson["dayOfWeek"],
                    "startTime":  lesson["startTime"],
                    "endTime":    lesson["endTime"],
                    "program":    lesson["program"],
                    "note":       lesson["note"],
                    "instructor": "",
                    "prefecture": gym["prefecture"],
                    "city":       gym["city"],
                    "address":    gym["address"],
                    "station":    gym["station"],
                    "gymUrl":     gym["gymUrl"],
                    "mapUrl":     gym["mapUrl"],
                })

    return results


def download_pdf(url):
    """URLからPDFをダウンロードして一時ファイルパスを返す"""
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as res:
            tmp.write(res.read())
        tmp.close()
        return tmp.name
    except Exception as e:
        tmp.close()
        os.unlink(tmp.name)
        raise e


def parse_gym(gym):
    """1ジムのPDFをダウンロード・解析してVIRTUALクラスリストを返す"""
    print(f"\n📍 {gym['gymName']}")
    print(f"   ダウンロード中: {gym['url']}")
    try:
        pdf_path = download_pdf(gym["url"])
    except Exception as e:
        print(f"   ❌ ダウンロード失敗: {e}")
        return []

    try:
        results = extract_from_pdf(pdf_path, gym)
        print(f"   → VIRTUALクラス {len(results)}件取得")
        for r in sorted(results, key=lambda x: (x["dayOfWeek"], x["startTime"])):
            print(f"     {r['dayOfWeek']}曜 {r['startTime']}〜{r['endTime']} {r['program']} {r['note']}")
        return results
    finally:
        os.unlink(pdf_path)


def merge_schedules(existing_bf, new_pdf_entries, gym_id):
    """
    既存DBとPDF抽出結果をマージする戦略:
    1. PDFにあるクラス → PDF最新データを使用
    2. DBにあってPDFにないクラス → 手動追加として保持（ユーザーが意図的に追加した可能性）
    ※ 有人クラス誤登録は check-bluefitness-schedules.py で定期チェックして手動削除
    """
    def key(e):
        return (e["dayOfWeek"], e["startTime"], e["program"])

    pdf_keys = {key(e) for e in new_pdf_entries}
    db_keys  = {key(e) for e in existing_bf}

    # PDFにあるクラスは最新PDFデータで更新
    merged = list(new_pdf_entries)

    # DBにあってPDFにないクラスは手動追加として保持
    manual_entries = [e for e in existing_bf if key(e) not in pdf_keys]
    if manual_entries:
        print(f"   ℹ️  手動追加データ {len(manual_entries)}件を保持:")
        for e in manual_entries:
            print(f"     {e['dayOfWeek']}曜 {e['startTime']} {e['program']}（手動追加）")
        merged.extend(manual_entries)

    # 新規追加クラス
    new_entries = [e for e in new_pdf_entries if key(e) not in db_keys]
    if new_entries:
        print(f"   🆕 新規クラス {len(new_entries)}件:")
        for e in new_entries:
            print(f"     {e['dayOfWeek']}曜 {e['startTime']} {e['program']}")

    return merged


def main():
    schedules_path = os.path.join(os.path.dirname(__file__), "..", "data", "schedules.json")
    with open(schedules_path, encoding="utf-8") as f:
        existing = json.load(f)

    non_bf = [s for s in existing if s.get("chain") != "BlueFitness"]
    existing_bf = [s for s in existing if s.get("chain") == "BlueFitness"]

    print("=" * 55)
    print("  BlueFitness スケジュール 自動更新")
    print("=" * 55)
    print(f"現在のBlueFitnessレッスン数: {len(existing_bf)}件\n")

    all_new_bf = []

    for gym in PDF_GYMS:
        # PDFから新規データを取得
        pdf_results = parse_gym(gym)

        # このジムの既存データ
        gym_existing = [e for e in existing_bf if e.get("gymId") == gym["gymId"]]

        # マージ
        merged = merge_schedules(gym_existing, pdf_results, gym["gymId"])
        all_new_bf.extend(merged)

    # 差分サマリー
    print("\n" + "=" * 55)
    print("  更新サマリー")
    print("=" * 55)

    def key(e):
        return (e["gymId"], e["dayOfWeek"], e["startTime"], e["program"])

    old_keys = {key(e) for e in existing_bf}
    new_keys = {key(e) for e in all_new_bf}

    added   = new_keys - old_keys
    removed = old_keys - new_keys

    if added:
        print(f"\n🆕 新規追加: {len(added)}件")
    if removed:
        print(f"\n❌ 削除: {len(removed)}件")
        for k in sorted(removed):
            e = next(x for x in existing_bf if key(x) == k)
            print(f"   gymId:{k[0]} {k[1]}曜 {k[2]} {k[3]}")
    if not added and not removed:
        print("✅ 変更なし")

    updated_total = non_bf + all_new_bf
    print(f"\n合計: {len(existing)}件 → {len(updated_total)}件")

    # 保存
    if AUTO_MODE:
        answer = "y"
        print("\n自動モード: schedules.jsonを更新します")
    else:
        answer = input("\nschedules.jsonを更新しますか？ (y/n): ").strip().lower()

    if answer == "y":
        with open(schedules_path, "w", encoding="utf-8") as f:
            json.dump(updated_total, f, ensure_ascii=False, indent=2)
        print(f"✅ schedules.json を更新しました（合計{len(updated_total)}件）")
    else:
        print("更新をキャンセルしました")


if __name__ == "__main__":
    main()
