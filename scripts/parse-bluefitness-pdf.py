"""
BlueFitness VRクラス PDFスケジュール抽出スクリプト
対象: BODYATTACK / BODYCOMBAT / BODYPUMP / GRIT
使い方:
  手動: python3 scripts/parse-bluefitness-pdf.py
  自動: python3 scripts/parse-bluefitness-pdf.py --auto  (確認なしで保存)
"""

import pdfplumber
import re
import json
import os
import sys
import urllib.request
import tempfile

# 自動モード（GitHub Actions用）
AUTO_MODE = "--auto" in sys.argv

# 曜日マッピング (テーブルindex 1-7 → 曜日)
DAY_MAP = {1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土", 7: "日"}

# PDFのURL → gymId マッピング
PDF_GYMS = [
    {
        "url": "https://www.blue-fitness24.com/kiyosumishirakawa_lp/images/schedule.pdf",
        "gymId": 11,
        "gymName": "BLUE FITNESS 24＋studio 清澄白河",
    },
    {
        "url": "https://www.blue-fitness24.com/kachidoki/images/schedule.pdf",
        "gymId": 12,
        "gymName": "BLUE FITNESS 24＋studio 勝どき",
    },
    {
        "url": "https://www.blue-fitness24.com/kayabacho-shinkawa_lp/images/schedule.pdf",
        "gymId": 13,
        "gymName": "BLUE FITNESS 24＋studio 茅場町・新川",
    },
    {
        "url": "https://www.blue-fitness24.com/mizue_lp/images/schedule.pdf",
        "gymId": 14,
        "gymName": "BLUE FITNESS 24＋studio 瑞江",
    },
]

TARGET_PROGRAMS = ["BODYATTACK", "BODY ATTACK", "BODYCOMBAT", "BODY COMBAT", "BODYPUMP", "BODY PUMP", "GRIT"]

def normalize_program(text):
    u = text.upper().replace(" ", "")
    if "BODYATTACK" in u: return "BODYATTACK"
    if "BODYCOMBAT" in u: return "BODYCOMBAT"
    if "BODYPUMP" in u: return "BODYPUMP"
    if "GRIT" in u: return "GRIT"
    return text.strip()

def get_grit_note(text):
    u = text.upper()
    if "CARDIO" in u: return "GRIT CARDIO"
    if "STRENGTH" in u: return "GRIT STRENGTH"
    if "ATHLETIC" in u: return "GRIT ATHLETIC"
    return ""

def is_target(text):
    u = text.upper().replace(" ", "")
    return any(t.replace(" ", "") in u for t in TARGET_PROGRAMS)

def parse_table(table, day_of_week):
    """1つのテーブル（1曜日分）からターゲットレッスンを抽出"""
    results = []
    for row in table:
        for cell in row:
            if not cell:
                continue
            lines = [l.strip() for l in str(cell).replace("\n", "\n").split("\n") if l.strip()]
            text = " ".join(lines)

            if not is_target(text):
                continue

            # 時刻 "HH:MM～HH:MM" を抽出
            time_match = re.search(r"(\d{1,2}):(\d{2})\s*[～~]\s*(\d{1,2}):(\d{2})", text)
            if not time_match:
                continue

            start_time = f"{int(time_match.group(1)):02d}:{time_match.group(2)}"
            end_time = f"{int(time_match.group(3)):02d}:{time_match.group(4)}"

            # プログラム名を探す
            program_line = next((l for l in lines if is_target(l)), None)
            if not program_line:
                continue

            program = normalize_program(program_line)
            note = get_grit_note(program_line) if program == "GRIT" else ""

            # インストラクター: プログラム名・時刻・「VR」以外の短い行
            instructor = ""
            for l in lines:
                if re.search(r"\d:\d", l): continue
                if is_target(l): continue
                if "VR" in l.upper(): continue
                if len(l) > 20: continue
                if l in ("", "イブ", "ブリッド", "ハイ", "ハイブリッド"): continue
                instructor = l
                break

            results.append({
                "dayOfWeek": day_of_week,
                "startTime": start_time,
                "endTime": end_time,
                "program": program,
                "note": note,
                "instructor": instructor.strip(),
            })
    return results


def download_pdf(url):
    """PDFをURLからダウンロードして一時ファイルに保存、パスを返す"""
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


def parse_pdf(gym):
    print(f"  ダウンロード中: {gym['url']}")
    try:
        pdf_path = download_pdf(gym["url"])
    except Exception as e:
        print(f"  ❌ ダウンロード失敗: {e}")
        return []

    results = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[0]
            tables = page.extract_tables()

            # テーブル0はヘッダー行、1-7が月-日
            for tbl_idx, tbl in enumerate(tables):
                if tbl_idx not in DAY_MAP:
                    continue
                day = DAY_MAP[tbl_idx]
                lessons = parse_table(tbl, day)
                for lesson in lessons:
                    results.append({
                        "gymId": gym["gymId"],
                        "gymName": gym["gymName"],
                        "chain": "BlueFitness",
                        **lesson,
                    })
                    print(f"  {day}曜 {lesson['startTime']}-{lesson['endTime']} {lesson['program']} {lesson['note']} {lesson['instructor']}")
    finally:
        os.unlink(pdf_path)

    return results


def main():
    all_results = []

    for gym in PDF_GYMS:
        print(f"\n📍 {gym['gymName']}")
        results = parse_pdf(gym)
        all_results.append({"gym": gym, "results": results})
        print(f"  → {len(results)}件取得")

    # schedules.json を読み込み
    schedules_path = os.path.join(os.path.dirname(__file__), "..", "data", "schedules.json")
    with open(schedules_path, encoding="utf-8") as f:
        existing = json.load(f)

    bf_existing = [s for s in existing if s.get("chain") == "BlueFitness"]
    non_bf = [s for s in existing if s.get("chain") != "BlueFitness"]

    new_bf = [r for gym_data in all_results for r in gym_data["results"]]

    # 差分チェック
    print("\n=== 差分チェック ===")
    print(f"既存BlueFitnessレッスン数: {len(bf_existing)}")
    print(f"今回PDF取得数: {len(new_bf)}")

    added = [r for r in new_bf if not any(
        e["gymId"] == r["gymId"] and e["dayOfWeek"] == r["dayOfWeek"] and
        e["startTime"] == r["startTime"] and e["program"] == r["program"]
        for e in bf_existing
    )]
    removed = [e for e in bf_existing if not any(
        r["gymId"] == e["gymId"] and r["dayOfWeek"] == e["dayOfWeek"] and
        r["startTime"] == e["startTime"] and r["program"] == e["program"]
        for r in new_bf
    )]

    if added:
        print(f"\n🆕 新規 {len(added)}件:")
        for r in added:
            print(f"  {r['gymName']} {r['dayOfWeek']}曜 {r['startTime']} {r['program']}")
    if removed:
        print(f"\n❌ 削除 {len(removed)}件:")
        for e in removed:
            print(f"  {e['gymName']} {e['dayOfWeek']}曜 {e['startTime']} {e['program']}")
    if not added and not removed:
        print("✅ 差分なし")

    # 保存
    if AUTO_MODE:
        answer = "y"
        print("\n自動モード: schedules.jsonを更新します")
    else:
        answer = input("\nschedules.jsonを更新しますか？ (y/n): ").strip().lower()

    if answer == "y":
        updated = non_bf + new_bf
        with open(schedules_path, "w", encoding="utf-8") as f:
            json.dump(updated, f, ensure_ascii=False, indent=2)
        print(f"✅ schedules.json を更新しました（合計{len(updated)}件）")
    else:
        print("更新をキャンセルしました")


if __name__ == "__main__":
    main()
