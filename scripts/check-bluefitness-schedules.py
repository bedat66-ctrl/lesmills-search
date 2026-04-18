"""
BlueFitness スケジュール チェックスクリプト
ローカルPDFと schedules.json を照合し、差分をレポートします。

使い方:
  python3 scripts/check-bluefitness-schedules.py

出力:
  - VIRTUALクラスで schedules.json に未登録のもの（追加候補）
  - schedules.json にあるのに PDF にないもの（削除候補）
  - 注: 有人LIVEクラス（インストラクター名あり）は自動除外します
"""

import pdfplumber
import re
import json
import os

# ===== 設定 =====
SCRIPT_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.join(SCRIPT_DIR, "..")

PDF_GYMS = [
    {"file": "ブルーフィットネス清澄白河04.pdf", "gymId": 11, "gymName": "清澄白河"},
    {"file": "ブルーフィットネス勝どき04.pdf",   "gymId": 12, "gymName": "勝どき"},
    {"file": "ブルーフィットネス茅場町04.pdf",   "gymId": 13, "gymName": "茅場町"},
    {"file": "ブルーフィットネス瑞江04.pdf",     "gymId": 14, "gymName": "瑞江"},
]

DAY_LABELS = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"]
DAY_SHORT  = ["月",     "火",     "水",     "木",     "金",     "土",     "日"]

TARGET_PROGRAMS = ["BODYATTACK", "BODYCOMBAT", "BODYPUMP", "GRIT", "BODYJAM"]

TIME_PAT    = re.compile(r"(\d{1,2}):(\d{2})\s*[～~]\s*(\d{1,2}):(\d{2})")
PROGRAM_PAT = re.compile(r"BODY\s*(ATTACK|COMBAT|PUMP|JAM)|GRIT(\s*(CARDIO|STRENGTH|ATHLETIC))?", re.IGNORECASE)
# 日本語文字を含む行 = インストラクター名（有人クラス）
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
    有人クラスのインストラクター名を判定。
    - 短い日本語テキスト（≤10文字）→ インストラクター名
    - 長い日本語テキスト（>10文字）→ フッターや説明文（除外しない）
    - 英語の短い名前 → インストラクター名
    """
    if JAPANESE_PAT.search(line):
        # 長い日本語テキストはフッターや説明文（インストラクター名ではない）
        if len(line) > 10:
            return False
        return True
    # 英語の短い名前（スペース含む10文字以内）
    if re.match(r'^[A-Z][a-zA-Z\s.]{1,9}$', line) and not normalize_program(line):
        return True
    return False


def extract_column_lessons(col_text, day):
    """
    列テキストから【VIRTUALクラスのみ】を抽出する。
    ルール:
      - 時刻行 → 次の行にプログラム名 → さらに次の行にインストラクター名があれば有人クラス（除外）
    """
    lessons = []
    lines = [l.strip() for l in col_text.split("\n") if l.strip()]

    i = 0
    while i < len(lines):
        tm = TIME_PAT.search(lines[i])
        if tm:
            start = f"{int(tm.group(1)):02d}:{tm.group(2)}"
            end   = f"{int(tm.group(3)):02d}:{tm.group(4)}"

            # 次の行(s)からプログラム名を探す（最大3行先まで）
            program = None
            program_idx = None
            note = ""
            for j in range(i + 1, min(i + 4, len(lines))):
                if TIME_PAT.search(lines[j]):
                    break  # 次の時刻が来たら終わり
                p = normalize_program(lines[j])
                if p:
                    program = p
                    program_idx = j
                    if p == "GRIT":
                        note = get_grit_note(lines[j])
                        # GRIT の場合、次行に "CARDIO" 等があることもある
                        if j + 1 < len(lines) and not TIME_PAT.search(lines[j+1]):
                            note = note or get_grit_note(lines[j+1])
                    break

            if program is None:
                i += 1
                continue

            # プログラム名の次の行がインストラクター名 → 有人クラス（除外）
            next_idx = program_idx + 1
            is_live = False
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


def extract_all_from_pdf(pdf_path):
    """PDFの全曜日からVIRTUALクラスを抽出"""
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
            print(f"  ⚠️ 曜日ヘッダーが7つ揃いません: {list(day_x.keys())}")

        sorted_days = sorted(day_x.items(), key=lambda kv: kv[1])

        results = {}
        for idx, (day, cx) in enumerate(sorted_days):
            # 列のx範囲を計算
            x0 = max((sorted_days[idx-1][1] + cx) / 2, TIME_AXIS_RIGHT) if idx > 0 else max(cx - 35, TIME_AXIS_RIGHT)
            x1 = (cx + sorted_days[idx+1][1]) / 2 if idx < len(sorted_days) - 1 else cx + 35

            bbox = (x0, 35, x1, page_height)
            cropped = page.within_bbox(bbox)
            col_text = cropped.extract_text() or ""
            results[day] = extract_column_lessons(col_text, day)

    return results


def check_gym(gym, schedules):
    pdf_path = os.path.join(ROOT_DIR, gym["file"])

    if not os.path.exists(pdf_path):
        print(f"  ❌ PDFが見つかりません: {pdf_path}")
        print(f"     → プロジェクトのルートフォルダにPDFを置いてください")
        return

    print(f"\n{'='*55}")
    print(f"📍 BlueFitness {gym['gymName']}  (gymId={gym['gymId']})")
    print(f"{'='*55}")

    # PDFから抽出（VIRTUALクラスのみ）
    pdf_by_day = extract_all_from_pdf(pdf_path)
    pdf_all = [l for lessons in pdf_by_day.values() for l in lessons]

    # schedules.json の該当ジム分
    db_entries = [s for s in schedules if s.get("gymId") == gym["gymId"]]

    print(f"  PDF抽出（VIRTUALのみ）: {len(pdf_all)}件")
    print(f"  schedules.json:         {len(db_entries)}件")

    def key(e):
        return (e["dayOfWeek"], e["startTime"], e["program"])

    pdf_keys = {key(e) for e in pdf_all}
    db_keys  = {key(e) for e in db_entries}

    match_count = len(pdf_keys & db_keys)

    # PDFにあってDBにない → 追加候補
    only_pdf = sorted(pdf_keys - db_keys)
    # DBにあってPDFにない → 削除or確認候補
    only_db  = sorted(db_keys - pdf_keys)

    print(f"  ✅ 一致:  {match_count}件")

    if only_pdf:
        print(f"\n  🆕 PDFにある・DBに未登録（追加候補） {len(only_pdf)}件")
        for d, st, prog in only_pdf:
            end = next((e["endTime"] for e in pdf_all if key(e) == (d, st, prog)), "?")
            note = next((e["note"]    for e in pdf_all if key(e) == (d, st, prog)), "")
            label = note if note else prog
            print(f"     {d}曜  {st}〜{end}  {label}")
    else:
        print("  ✅ 未登録クラスなし")

    if only_db:
        print(f"\n  ⚠️  DBにある・PDFに見つからない（確認推奨） {len(only_db)}件")
        for d, st, prog in only_db:
            end = next((e["endTime"] for e in db_entries if key(e) == (d, st, prog)), "?")
            print(f"     {d}曜  {st}〜{end}  {prog}")
    else:
        print("  ✅ 余分なクラスなし")


def main():
    schedules_path = os.path.join(ROOT_DIR, "data", "schedules.json")
    with open(schedules_path, encoding="utf-8") as f:
        schedules = json.load(f)

    print("=" * 55)
    print("  BlueFitness スケジュール 照合チェック")
    print("=" * 55)
    print("※ 有人LIVEクラスは自動除外して比較しています\n")

    for gym in PDF_GYMS:
        check_gym(gym, schedules)

    print("\n\n照合チェック完了")
    print("─────────────────────────────────")
    print("🆕 追加候補 → PDFにあるVIRTUALクラスが未登録")
    print("⚠️  確認推奨 → DBにあるがPDFで見つからなかった")
    print("           （手動追加分・PDF変更・抽出ミスの可能性）")


if __name__ == "__main__":
    main()
