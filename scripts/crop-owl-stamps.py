#!/usr/bin/env python3
"""
ふくろうスタンプ切り出しスクリプト
使い方: python3 scripts/crop-owl-stamps.py <画像ファイルパス>
"""

import sys
import os
from PIL import Image

def crop_stamps(input_path, output_dir="data/owl-stamps"):
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    print(f"画像サイズ: {width} x {height}")

    os.makedirs(output_dir, exist_ok=True)

    # ラジオ体操第一の画像レイアウト
    # 右端のテキスト・アイコン列を除外し、ふくろう部分だけを対象にする
    # 4行 × 6列 = 24羽 （最終行は5羽のみ）
    COLS = 6
    ROWS = 4

    # ふくろうが並ぶ領域を手動で指定（画像サイズに応じて自動計算）
    # 右側のテキスト列（約1/5）を除外
    owl_area_width = int(width * 0.78)
    owl_area_height = height

    cell_w = owl_area_width // COLS
    cell_h = owl_area_height // ROWS

    # LINE スタンプ推奨サイズ
    STAMP_SIZE = (370, 320)

    count = 0
    for row in range(ROWS):
        for col in range(COLS):
            # 最終行の6列目はラジオの絵なのでスキップ
            if row == 3 and col == 5:
                continue

            x1 = col * cell_w
            y1 = row * cell_h
            x2 = x1 + cell_w
            y2 = y1 + cell_h

            cell = img.crop((x1, y1, x2, y2))

            # 白背景を透明に変換
            cell = cell.convert("RGBA")
            datas = cell.getdata()
            new_data = []
            for item in datas:
                r, g, b, a = item
                if r > 230 and g > 230 and b > 230:
                    new_data.append((255, 255, 255, 0))
                else:
                    new_data.append(item)
            cell.putdata(new_data)

            # LINEスタンプサイズにリサイズ（比率を保つ）
            cell.thumbnail(STAMP_SIZE, Image.LANCZOS)

            # 透明な370x320キャンバスに貼り付け（中央配置）
            canvas = Image.new("RGBA", STAMP_SIZE, (255, 255, 255, 0))
            offset_x = (STAMP_SIZE[0] - cell.width) // 2
            offset_y = (STAMP_SIZE[1] - cell.height) // 2
            canvas.paste(cell, (offset_x, offset_y), cell)

            count += 1
            out_path = os.path.join(output_dir, f"stamp_{count:02d}.png")
            canvas.save(out_path)
            print(f"  保存: {out_path}")

    print(f"\n✅ 完了！{count}枚のスタンプを {output_dir} に保存しました。")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("使い方: python3 scripts/crop-owl-stamps.py <画像ファイルパス>")
        print("例:     python3 scripts/crop-owl-stamps.py ~/Downloads/radio-taiso-owl.png")
        sys.exit(1)
    crop_stamps(sys.argv[1])
