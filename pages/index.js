import { useState, useEffect, useRef, useCallback } from "react";
import schedules from "../data/schedules.json";

// タッチ・マウス両対応のデュアルレンジスライダー
function DualRangeSlider({ min, max, from, to, onFromChange, onToChange, fmtLabel }) {
  const trackRef = useRef(null);
  const dragging = useRef(null); // "from" | "to" | null

  const getVal = useCallback((clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(min + pct * (max - min));
  }, [min, max]);

  const startDrag = useCallback((clientX) => {
    const val = getVal(clientX);
    const distFrom = Math.abs(val - from);
    const distTo = Math.abs(val - to);
    dragging.current = distFrom <= distTo ? "from" : "to";
    moveDrag(clientX);
  }, [from, to, getVal]);

  const moveDrag = useCallback((clientX) => {
    if (!dragging.current) return;
    const val = getVal(clientX);
    if (dragging.current === "from") onFromChange(Math.min(val, to - 1));
    else onToChange(Math.max(val, from + 1));
  }, [from, to, getVal, onFromChange, onToChange]);

  const endDrag = () => { dragging.current = null; };

  // マウス
  const onMouseDown = (e) => { e.preventDefault(); startDrag(e.clientX); };
  useEffect(() => {
    const onMove = (e) => moveDrag(e.clientX);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", endDrag);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", endDrag); };
  }, [moveDrag]);

  // タッチ
  const onTouchStart = (e) => { startDrag(e.touches[0].clientX); };
  const onTouchMove = (e) => { e.preventDefault(); moveDrag(e.touches[0].clientX); };

  const toPct = (v) => ((v - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-stone-700 dark:text-stone-300 w-10 text-center shrink-0" translate="no">
        {fmtLabel(from)}
      </span>
      <div
        ref={trackRef}
        className="relative flex-1 h-6 cursor-pointer select-none"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endDrag}
        style={{ touchAction: "none" }}
      >
        {/* トラック背景 */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-700">
          <div
            className="absolute h-full rounded-full bg-stone-700 dark:bg-stone-300"
            style={{ left: `${toPct(from)}%`, right: `${100 - toPct(to)}%` }}
          />
        </div>
        {/* FROMつまみ */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-800 dark:bg-stone-200 border-2 border-white dark:border-stone-900 shadow-md"
          style={{ left: `calc(${toPct(from)}% - 10px)` }}
        />
        {/* TOつまみ */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-800 dark:bg-stone-200 border-2 border-white dark:border-stone-900 shadow-md"
          style={{ left: `calc(${toPct(to)}% - 10px)` }}
        />
      </div>
      <span className="text-xs font-bold text-stone-700 dark:text-stone-300 w-10 text-center shrink-0" translate="no">
        {fmtLabel(to)}
      </span>
    </div>
  );
}

const PROGRAMS = ["すべて", "BODYATTACK", "GRIT", "BODYPUMP", "BODYCOMBAT", "BODYJAM"];
const PROGRAM_SHORT = {
  "すべて": "ALL",
  "BODYATTACK": "ATTACK",
  "GRIT": "GRIT",
  "BODYPUMP": "PUMP",
  "BODYCOMBAT": "COMBAT",
  "BODYJAM": "JAM",
};
const DAYS = ["すべて", "月", "火", "水", "木", "金", "土", "日"];
const DAYS_OF_WEEK = ["月", "火", "水", "木", "金", "土", "日"];
const DAY_ORDER = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 7 };
const CHAINS = ["すべて", "NAS", "BlueFitness"];
const PREFECTURES = ["すべて", ...Array.from(new Set(schedules.map((s) => s.prefecture))).sort()];

const PROGRAM_BADGE = {
  BODYATTACK: "bg-amber-400 text-stone-900",
  BODYCOMBAT: "text-white",  // bg color applied via style
  BODYPUMP: "bg-red-600 text-white",
  GRIT: "bg-stone-700 text-stone-100",
  BODYJAM: "bg-purple-600 text-white",
};

// 週表示のブロック背景色（ライト / ダーク）
const PROGRAM_BG = {
  BODYATTACK: "#fbbf24",
  BODYCOMBAT: "#5a5a1a",
  BODYPUMP: "#c0182e",
  GRIT: "#44403c",
  BODYJAM: "#7c3aed",
};
const PROGRAM_BG_DARK = {
  BODYATTACK: "#fbbf24",
  BODYCOMBAT: "#8a8a1e",   // ダーク時は明るめオリーブ
  BODYPUMP: "#c0182e",
  GRIT: "#57534e",
  BODYJAM: "#a78bfa",
};
const PROGRAM_COLOR = {
  BODYATTACK: "#1c1917",
  BODYCOMBAT: "#fff",
  BODYPUMP: "#fff",
  GRIT: "#f5f5f4",
  BODYJAM: "#fff",
};
const CHAIN_BADGE = {
  NAS: "bg-stone-200 text-stone-600",
  BlueFitness: "bg-blue-100 text-blue-700",
};

// 週表示の定数
const HOUR_PX = 60;
const DAY_START_H = 5;
const DAY_END_H = 25; // 深夜1時台まで表示 (BlueFitnessの深夜クラス対応)
const TOTAL_HEIGHT = (DAY_END_H - DAY_START_H) * HOUR_PX;

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  // 深夜0時・1時台は翌日扱い (24時・25時) にして週表示に収める
  const hour = h <= 1 ? h + 24 : h;
  return hour * 60 + m;
}
function topPx(startTime) {
  return ((timeToMinutes(startTime) - DAY_START_H * 60) / 60) * HOUR_PX;
}
function heightPx(startTime, endTime) {
  let diff = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (diff <= 0) diff += 24 * 60;
  return Math.max((diff / 60) * HOUR_PX - 2, 20);
}

// 同じ時間帯のクラスを横に並べるためのレーン計算
function assignLanes(events) {
  const sorted = [...events].sort((a, b) =>
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  const laneEnds = [];
  const result = sorted.map((ev) => {
    const s = timeToMinutes(ev.startTime);
    const e =
      timeToMinutes(ev.endTime) <= s
        ? timeToMinutes(ev.endTime) + 1440
        : timeToMinutes(ev.endTime);
    let lane = laneEnds.findIndex((le) => le <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else {
      laneEnds[lane] = e;
    }
    return { ...ev, lane };
  });
  return { events: result, numLanes: laneEnds.length };
}

// ジム名マスク（スクリーンショット用）
const GYM_MASK = {
  "スポーツクラブNAS西日暮里": "フィットネスクラブA（西部）",
  "スポーツクラブNAS大崎": "フィットネスクラブA（南部）",
  "スポーツクラブNASリバーシティ21": "フィットネスクラブA（東部）",
  "スポーツクラブNAS西葛西": "フィットネスクラブA（東部2）",
  "スポーツクラブNAS戸塚": "フィットネスクラブA（横浜）",
  "スポーツクラブNAS藤沢": "フィットネスクラブA（湘南）",
  "スポーツクラブNAS新川崎": "フィットネスクラブA（川崎）",
  "スポーツクラブNAS篠崎": "フィットネスクラブA（東部3）",
  "スポーツクラブNAS溝の口": "フィットネスクラブA（川崎2）",
  "スポーツクラブNAS中山": "フィットネスクラブA（横浜2）",
  "スポーツクラブNAS蕨": "フィットネスクラブA（北部）",
  "BLUE FITNESS 24＋studio 清澄白河": "フィットネスクラブB（清澄）",
  "BLUE FITNESS 24＋studio 勝どき": "フィットネスクラブB（勝どき）",
  "BLUE FITNESS 24＋studio 茅場町・新川": "フィットネスクラブB（茅場町）",
  "BLUE FITNESS 24＋studio 瑞江": "フィットネスクラブB（瑞江）",
};

export default function Home() {
  const [program, setProgram] = useState("すべて");
  const [prefecture, setPrefecture] = useState("すべて");
  const [day, setDay] = useState("すべて");
  const [chain, setChain] = useState("すべて");
  const [timeFrom, setTimeFrom] = useState(5);
  const [timeTo, setTimeTo] = useState(25);
  const [popup, setPopup] = useState(null); // { schedule, blockRect }
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [dark, setDark] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [viewMode, setViewMode] = useState("calendar"); // "calendar" | "list"
  const [hasDefaults, setHasDefaults] = useState(false);
  const calendarRef = useRef(null);

  // デフォルト設定: マウント時にlocalStorageから復元
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("lesmills_defaults") || "null");
      if (saved) {
        setHasDefaults(true);
        if (saved.program) setProgram(saved.program);
        if (saved.prefecture) setPrefecture(saved.prefecture);
        if (saved.day) setDay(saved.day);
        if (saved.chain) setChain(saved.chain);
        if (saved.timeFrom != null) setTimeFrom(saved.timeFrom);
        if (saved.timeTo != null) setTimeTo(saved.timeTo);
      }
    } catch {}
  }, []);

  // 今すぐボタン: 今日の曜日・現在時刻以降に絞り込み、カレンダーを現在時刻にスクロール
  const handleNow = () => {
    const todayDow = new Date().getDay();
    const todayDowJa = ["日","月","火","水","木","金","土"][todayDow];
    const currentHour = new Date().getHours();
    setDay(todayDowJa);
    setTimeFrom(Math.max(TIME_MIN, currentHour));
    setTimeTo(TIME_MAX);
    setTimeout(() => {
      if (calendarRef.current) {
        const scrollTo = Math.max(0, (currentHour - DAY_START_H - 1) * HOUR_PX);
        calendarRef.current.scrollTo({ top: scrollTo, behavior: "smooth" });
      }
    }, 50);
  };

  // TIMEを全時間帯に戻す
  const resetTime = () => {
    setTimeFrom(TIME_MIN);
    setTimeTo(TIME_MAX);
  };

  // デフォルト設定の保存・クリア
  const saveDefaults = () => {
    localStorage.setItem("lesmills_defaults", JSON.stringify({ program, prefecture, day, chain, timeFrom, timeTo }));
    setHasDefaults(true);
    alert("現在のフィルター設定をデフォルトに保存しました");
  };
  const clearDefaults = () => {
    localStorage.removeItem("lesmills_defaults");
    setHasDefaults(false);
    alert("デフォルト設定をリセットしました");
  };

  // ポインター/タッチ追従
  useEffect(() => {
    if (!popup) return;
    const onMove = (e) => {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      setPointerPos({ x, y });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
    };
  }, [popup]);

  const fmtHour = (h) => h >= 24 ? `${String(h - 24).padStart(2, "0")}:00` : `${String(h).padStart(2, "0")}:00`;
  const TIME_MIN = 5;
  const TIME_MAX = 25;
  const toPct = (h) => ((h - TIME_MIN) / (TIME_MAX - TIME_MIN)) * 100;

  const filtered = schedules
    .filter((s) => program === "すべて" || s.program === program)
    .filter((s) => prefecture === "すべて" || s.prefecture === prefecture)
    .filter((s) => day === "すべて" || s.dayOfWeek === day)
    .filter((s) => chain === "すべて" || s.chain === chain)
    .filter((s) => {
      const startMin = timeToMinutes(s.startTime);
      return startMin >= timeFrom * 60 && startMin < timeTo * 60;
    })
    .sort(
      (a, b) =>
        DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek] ||
        a.startTime.localeCompare(b.startTime)
    );

  // 当日の曜日からスタートする順に並べる
  const todayJsDow = new Date().getDay(); // 0=日,1=月...6=土
  const todayIdx = todayJsDow === 0 ? 6 : todayJsDow - 1; // 月=0,火=1...日=6
  const activeDays = day === "すべて"
    ? [...DAYS_OF_WEEK.slice(todayIdx), ...DAYS_OF_WEEK.slice(0, todayIdx)]
    : [day];
  const hourLabels = Array.from(
    { length: DAY_END_H - DAY_START_H },
    (_, i) => DAY_START_H + i
  );

  // ダークモード用の色定義
  const gridBg = dark ? "#0c0a09" : "#ffffff";
  const gridLine = dark ? "#292524" : "#e7e5e4";
  const gridLine30 = dark ? "#1c1917" : "#f5f5f4";
  const hourColBg = dark ? "#0c0a09" : "#fafaf9";
  const hourColBorder = dark ? "#292524" : "#e7e5e4";
  const popupBg = dark ? "#1c1917" : "#ffffff";
  const popupText = dark ? "#f5f5f4" : "#1c1917";
  const popupSub = dark ? "#a8a29e" : "#78716c";
  const popupBodyText = dark ? "#d6d3d1" : "#57534e";

  return (
    <div className={dark ? "dark" : ""}>
    <div className="min-h-screen bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* ヘッダー（コンパクト） */}
      <header className="bg-stone-800 text-stone-100 px-4 py-2 dark:bg-stone-950 dark:border-b dark:border-stone-800">
        <div className="max-w-2xl mx-auto flex items-baseline gap-3">
          <h1 className="text-base font-black tracking-tight text-stone-100" translate="no">
            LES MILLS 検索
          </h1>
          <span className="text-xs font-bold tracking-widest text-stone-400 uppercase" translate="no">
            Program Search
          </span>
          {/* ダークモード切替 */}
          <button
            onClick={() => setDark((v) => !v)}
            className="ml-auto text-lg leading-none"
            title={dark ? "ライトモード" : "ダークモード"}
          >
            {dark ? "☀️" : "🌙"}
          </button>
          {/* デモモード切替（動画撮影用・黒塗り） */}
          <button
            onClick={() => setDemoMode((v) => !v)}
            className={`text-xs px-1.5 py-0.5 rounded border transition-all leading-none ${demoMode ? "bg-stone-100 text-stone-900 border-stone-100" : "border-stone-700 text-stone-600"}`}
            title="デモモード"
            style={{ fontSize: 14 }}
          >
            🎬
          </button>
        </div>
      </header>

      <main className="px-3 py-3">
        {/* フィルター（コンパクト） */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-3 mb-3 shadow-sm max-w-2xl mx-auto dark:bg-stone-900 dark:border-stone-700">

          {/* PROGRAM */}
          <div className="mb-2">
            <label className="block text-xs text-stone-400 mb-1 tracking-wider" translate="no">PROGRAM</label>
            {/* 1行目: ALL / ATTACK / GRIT */}
            <div className="flex gap-1 mb-1">
              {["すべて", "BODYATTACK", "GRIT"].map((p) => (
                <button
                  key={p}
                  onClick={() => setProgram(p)}
                  translate="no"
                  className={`flex-1 py-1 rounded text-xs font-bold tracking-wider uppercase border transition-all ${
                    program === p
                      ? "bg-stone-700 text-stone-100 border-stone-700 dark:bg-stone-300 dark:text-stone-900 dark:border-stone-300"
                      : "bg-stone-50 text-stone-500 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-600"
                  }`}
                >
                  {PROGRAM_SHORT[p]}
                </button>
              ))}
            </div>
            {/* 2行目: PUMP / COMBAT / JAM */}
            <div className="flex gap-1">
              {["BODYPUMP", "BODYCOMBAT", "BODYJAM"].map((p) => (
                <button
                  key={p}
                  onClick={() => setProgram(p)}
                  translate="no"
                  className={`flex-1 py-1 rounded text-xs font-bold tracking-wider uppercase border transition-all ${
                    program === p
                      ? "bg-stone-700 text-stone-100 border-stone-700 dark:bg-stone-300 dark:text-stone-900 dark:border-stone-300"
                      : "bg-stone-50 text-stone-500 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-600"
                  }`}
                >
                  {PROGRAM_SHORT[p]}
                </button>
              ))}
            </div>
          </div>

          {/* CHAIN */}
          <div className="mb-2">
            <label className="block text-xs text-stone-400 mb-1 tracking-wider" translate="no">CHAIN</label>
            <div className="flex gap-1">
              {CHAINS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChain(c)}
                  translate="no"
                  className={`flex-1 py-1 rounded text-xs font-bold tracking-wider uppercase border transition-all ${
                    chain === c
                      ? "bg-stone-700 text-stone-100 border-stone-700 dark:bg-stone-300 dark:text-stone-900 dark:border-stone-300"
                      : "bg-stone-50 text-stone-500 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-600"
                  }`}
                >
                  {c === "すべて" ? "ALL" : demoMode ? "██████" : c}
                </button>
              ))}
            </div>
          </div>

          {/* DAY */}
          <div className="mb-2">
            <label className="block text-xs text-stone-400 mb-1 tracking-wider" translate="no">DAY</label>
            <div className="flex gap-1">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDay(d)}
                  translate="no"
                  className={`flex-1 py-1 rounded text-xs font-bold border transition-all ${
                    day === d
                      ? "bg-stone-700 text-stone-100 border-stone-700 dark:bg-stone-300 dark:text-stone-900 dark:border-stone-300"
                      : "bg-stone-50 text-stone-500 border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-600"
                  }`}
                >
                  {d === "すべて" ? "ALL" : d}
                </button>
              ))}
            </div>
          </div>

          {/* 3行目: AREA + TIME */}
          <div className="flex gap-3 items-end">
            {/* AREA */}
            <div style={{ width: 110 }}>
              <label className="block text-xs text-stone-400 mb-1 tracking-wider" translate="no">AREA</label>
              <select
                value={prefecture}
                onChange={(e) => setPrefecture(e.target.value)}
                translate="no"
                className="w-full bg-stone-50 border border-stone-300 text-stone-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-stone-500 dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200"
              >
                {PREFECTURES.map((p) => (
                  <option key={p} value={p} translate="no">
                    {p === "すべて" ? "ALL" : p}
                  </option>
                ))}
              </select>
            </div>
            {/* TIME */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs text-stone-400 tracking-wider" translate="no">TIME</label>
                <button onClick={handleNow} className="text-xs text-stone-500 dark:text-stone-400 font-bold underline" translate="no">
                  今すぐ
                </button>
                <button onClick={resetTime} className="text-xs text-stone-400 dark:text-stone-500 underline" translate="no">
                  全時間
                </button>
              </div>
              <DualRangeSlider
                min={TIME_MIN} max={TIME_MAX}
                from={timeFrom} to={timeTo}
                onFromChange={setTimeFrom}
                onToChange={setTimeTo}
                fmtLabel={fmtHour}
              />
            </div>

          </div>
        </div>

        {/* 件数 + ツールバー */}
        <div className="flex items-center justify-between mb-3 max-w-2xl mx-auto gap-2 flex-wrap">
          <p className="text-xs text-stone-400 tracking-widest uppercase" translate="no">
            {filtered.length} Results
          </p>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
            {/* デフォルト設定 */}
            <button
              onClick={saveDefaults}
              className={`text-xs px-2.5 py-1 rounded-full border font-bold transition-all ${
                hasDefaults
                  ? "bg-amber-400 border-amber-400 text-stone-900"
                  : "border-stone-400 text-stone-600 dark:border-stone-500 dark:text-stone-300"
              }`}
              translate="no"
            >
              ⭐ 保存
            </button>
            <button
              onClick={clearDefaults}
              className="text-xs px-2 py-1 rounded-full border border-stone-300 text-stone-400 dark:border-stone-600 dark:text-stone-500"
              translate="no"
            >
              リセット
            </button>
            {/* 表示切替 */}
            <div className="flex rounded-lg border border-stone-300 dark:border-stone-600 overflow-hidden">
              <button
                onClick={() => setViewMode("calendar")}
                className={`px-2.5 py-1 text-xs font-bold transition-all ${viewMode === "calendar" ? "bg-stone-700 text-stone-100 dark:bg-stone-300 dark:text-stone-900" : "text-stone-400 dark:text-stone-500"}`}
                translate="no"
              >
                📅
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-2.5 py-1 text-xs font-bold transition-all ${viewMode === "list" ? "bg-stone-700 text-stone-100 dark:bg-stone-300 dark:text-stone-900" : "text-stone-400 dark:text-stone-500"}`}
                translate="no"
              >
                ☰
              </button>
            </div>
          </div>
        </div>

        {/* ── リスト表示 ── */}
        {viewMode === "list" && (() => {
          const listItems = [...filtered].sort((a, b) => {
            const ai = activeDays.indexOf(a.dayOfWeek);
            const bi = activeDays.indexOf(b.dayOfWeek);
            if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            return a.startTime.localeCompare(b.startTime);
          });
          return (
            <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden max-w-2xl mx-auto mb-4">
              {listItems.length === 0 && (
                <p className="text-center text-xs text-stone-400 py-8">該当なし</p>
              )}
              {listItems.map((s, i) => {
                const blockBg = (dark ? PROGRAM_BG_DARK : PROGRAM_BG)[s.program] || "#44403c";
                const gName = s.gymName
                  .replace("スポーツクラブNAS", "NAS")
                  .replace("BLUE FITNESS 24＋studio ", "BF ");
                const dispGName = demoMode ? "██████████████" : gName;
                const dispInst = demoMode ? "██████" : s.instructor;
                return (
                  <div
                    key={s.id}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPointerPos({ x: rect.left + rect.width / 2, y: rect.top });
                      setPopup({ schedule: s, blockRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } });
                    }}
                    className={`flex items-stretch cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors ${i > 0 ? "border-t border-stone-100 dark:border-stone-800" : ""}`}
                  >
                    {/* 左カラー帯 */}
                    <div style={{ background: blockBg, width: 5, flexShrink: 0 }} />
                    {/* 内容 */}
                    <div className="flex-1 py-2.5 px-3">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span translate="no" className="text-xs font-black" style={{ color: blockBg }}>{s.program}</span>
                        <span translate="no" className="text-sm font-black text-stone-800 dark:text-stone-100">{s.startTime}–{s.endTime}</span>
                        <span translate="no" className="text-xs text-stone-400">{s.dayOfWeek}曜</span>
                      </div>
                      <div translate="no" className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{dispGName}</div>
                      {s.instructor && s.chain !== "BlueFitness" && (
                        <div translate="no" className="text-xs text-stone-400 dark:text-stone-500">👤 {dispInst}さん</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── 週表示 ── */}
        {viewMode === "calendar" && <div
          ref={calendarRef}
          className="rounded-xl border border-stone-200 shadow-sm dark:border-stone-700"
          style={{ overflow: "auto", maxHeight: "calc(100vh - 260px)", background: gridBg }}
        >
            <div style={{ minWidth: `${48 + activeDays.length * 130}px` }}>
              {/* 曜日ヘッダー（縦スクロール時も固定） */}
              <div
                className="flex sticky top-0 z-20 bg-stone-800 text-stone-100 dark:bg-stone-950"
                style={{ borderBottom: `1px solid ${dark ? "#292524" : "#44403c"}` }}
              >
                <div
                  className="flex-shrink-0"
                  style={{ width: 48, borderRight: `1px solid ${dark ? "#44403c" : "#57534e"}` }}
                />
                {activeDays.map((d) => (
                  <div
                    key={d}
                    translate="no"
                    className="flex-1 text-center text-sm font-bold py-2"
                    style={{ borderRight: `1px solid ${dark ? "#44403c" : "#57534e"}` }}
                  >
                    {d}曜
                  </div>
                ))}
              </div>

              {/* グリッド本体 */}
              <div className="flex">
                {/* 時刻ラベル列 */}
                <div
                  className="flex-shrink-0 relative"
                  style={{
                    width: 48,
                    height: TOTAL_HEIGHT,
                    background: hourColBg,
                    borderRight: `1px solid ${hourColBorder}`,
                  }}
                >
                  {hourLabels.map((h) => (
                    <div
                      key={h}
                      className="absolute w-full text-right pr-1"
                      style={{ top: (h - DAY_START_H) * HOUR_PX - 7 }}
                    >
                      <span className="text-xs text-stone-400" translate="no">
                        {String(h >= 24 ? h - 24 : h).padStart(2, "0")}:00
                      </span>
                    </div>
                  ))}
                </div>

                {/* 各曜日の列 */}
                {activeDays.map((d) => {
                  const dayEvents = filtered.filter((s) => s.dayOfWeek === d);
                  const { events, numLanes } = assignLanes(dayEvents);

                  return (
                    <div
                      key={d}
                      className="flex-1 relative"
                      style={{
                        height: TOTAL_HEIGHT,
                        minWidth: 130,
                        borderRight: `1px solid ${gridLine}`,
                      }}
                    >
                      {/* 1時間ごとの区切り線 */}
                      {hourLabels.map((h) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0"
                          style={{
                            top: (h - DAY_START_H) * HOUR_PX,
                            borderTop: `1px solid ${gridLine}`,
                          }}
                        />
                      ))}
                      {/* 30分ごとの区切り線 */}
                      {hourLabels.map((h) => (
                        <div
                          key={`${h}h`}
                          className="absolute left-0 right-0"
                          style={{
                            top: (h - DAY_START_H) * HOUR_PX + 30,
                            borderTop: `1px solid ${gridLine30}`,
                          }}
                        />
                      ))}

                      {/* クラスブロック */}
                      {events.map((s) => {
                        const top = topPx(s.startTime);
                        const height = heightPx(s.startTime, s.endTime);
                        const laneW = 100 / numLanes;
                        const blockBg = (dark ? PROGRAM_BG_DARK : PROGRAM_BG)[s.program] || "#44403c";
                        const blockColor = PROGRAM_COLOR[s.program] || "#f5f5f4";
                        const gymShort = s.gymName
                          .replace("スポーツクラブNAS ", "NAS ")
                          .replace("スポーツクラブNAS", "NAS")
                          .replace("BLUE FITNESS 24＋studio 清澄白河", "BF清澄")
                          .replace("BLUE FITNESS 24＋studio 勝どき", "BF勝")
                          .replace("BLUE FITNESS 24＋studio 瑞江", "BF瑞江")
                          .replace("BLUE FITNESS 24＋studio 茅場町・新川", "BF茅場")
                          .replace("BLUE FITNESS 24＋studio ", "BF ");
                        const isSmall = height < 42;
                        // ALL曜日表示時はプログラム名を短縮
                        const programLabel = day === "すべて"
                          ? (PROGRAM_SHORT[s.program] || s.program)
                          : s.program;
                        const gymShortDisplay = demoMode ? "██████" : gymShort;

                        return (
                          <div
                            key={s.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const cx = e.touches ? e.touches[0].clientX : e.clientX;
                              const cy = e.touches ? e.touches[0].clientY : e.clientY;
                              setPointerPos({ x: cx || rect.left + rect.width / 2, y: cy || rect.top });
                              setPopup({ schedule: s, blockRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } });
                            }}
                            style={{
                              position: "absolute",
                              top: top + 1,
                              height: height,
                              left: `calc(${s.lane * laneW}% + 1px)`,
                              width: `calc(${laneW}% - 2px)`,
                              padding: "2px 3px",
                              overflow: "hidden",
                              borderRadius: 4,
                              border: "1px solid rgba(255,255,255,0.4)",
                              background: blockBg,
                              color: blockColor,
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          >
                            <div
                              translate="no"
                              style={{
                                fontSize: 10,
                                fontWeight: "bold",
                                lineHeight: 1.2,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {programLabel}
                            </div>
                            {isSmall ? (
                              // 小さいブロック：施設名+時間帯を1行に収める
                              <div
                                translate="no"
                                style={{
                                  fontSize: 8,
                                  lineHeight: 1.2,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  opacity: 0.9,
                                }}
                              >
                                {gymShortDisplay} {s.startTime}–{s.endTime}
                              </div>
                            ) : (
                              <>
                                <div
                                  translate="no"
                                  style={{
                                    fontSize: 9,
                                    lineHeight: 1.2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    opacity: 0.9,
                                    fontWeight: "bold",
                                  }}
                                >
                                  {s.startTime}–{s.endTime}
                                </div>
                                <div
                                  translate="no"
                                  style={{
                                    fontSize: 9,
                                    lineHeight: 1.2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    opacity: 0.85,
                                  }}
                                >
                                  {gymShortDisplay}
                                </div>
                              </>
                            )}
                            {height >= 52 && s.instructor && s.chain !== "BlueFitness" && (
                              <div
                                translate="no"
                                style={{
                                  fontSize: 9,
                                  lineHeight: 1.2,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  opacity: 0.75,
                                }}
                              >
                                {demoMode ? "██████" : s.instructor}さん
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
        </div>}
      </main>

      {/* ポップアップ（ポインター追従カード） */}
      {popup && (() => {
        const s = popup.schedule;
        const chainLabel = demoMode ? "██████" : s.chain;
        const dispName = demoMode ? "██████████████" : s.gymName;
        const dispInstructor = demoMode ? "██████" : s.instructor;
        const cardW = 220;
        const cardH = 130; // 概算
        const vw = typeof window !== "undefined" ? window.innerWidth : 390;
        const vh = typeof window !== "undefined" ? window.innerHeight : 844;
        const px = pointerPos.x;
        const py = pointerPos.y;
        const br = popup.blockRect;

        // カードX: ポインターの右側を基本、画面端なら左側
        let cx = px + 12;
        if (cx + cardW > vw - 8) cx = px - cardW - 12;
        cx = Math.max(8, cx);

        // カードY: ブロックに重ならないよう上下で判定
        let cy;
        if (br.top - cardH - 8 > 8) {
          cy = br.top - cardH - 8; // ブロックの上
        } else {
          cy = br.bottom + 8; // ブロックの下
        }
        cy = Math.max(8, Math.min(cy, vh - cardH - 8));

        return (
          <>
            {/* 背景タップで閉じる */}
            <div className="fixed inset-0 z-40" onClick={() => setPopup(null)} />
            {/* カード本体 */}
            <div
              style={{
                position: "fixed",
                left: cx,
                top: cy,
                width: cardW,
                zIndex: 50,
                background: popupBg,
                borderRadius: 14,
                boxShadow: dark
                  ? "0 6px 24px rgba(0,0,0,0.60)"
                  : "0 6px 24px rgba(0,0,0,0.20)",
                overflow: "hidden",
                pointerEvents: "auto",
                border: dark ? "1px solid #292524" : "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* カラーヘッダー */}
              <div style={{ background: (dark ? PROGRAM_BG_DARK : PROGRAM_BG)[s.program] || "#292524", padding: "9px 12px 7px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span translate="no" style={{ fontSize: 13, fontWeight: 900, color: PROGRAM_COLOR[s.program] || "#fafaf9", letterSpacing: "0.05em" }}>
                    {s.program}
                  </span>
                  <button
                    onClick={() => setPopup(null)}
                    style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                  >×</button>
                </div>
                <div translate="no" style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>
                  {chainLabel}
                </div>
              </div>
              {/* 内容 */}
              <div style={{ padding: "9px 12px 11px" }}>
                <p translate="no" style={{ fontSize: 12, fontWeight: 800, color: popupText, lineHeight: 1.3, marginBottom: 5 }}>
                  {dispName}
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 4 }}>
                  <span translate="no" style={{ fontSize: 11, color: popupSub, fontWeight: 700 }}>{s.dayOfWeek}曜</span>
                  <span translate="no" style={{ fontSize: 14, fontWeight: 900, color: popupText }}>
                    {s.startTime}–{s.endTime}
                  </span>
                </div>
                {s.instructor && s.chain !== "BlueFitness" && (
                  <p translate="no" style={{ fontSize: 11, color: popupBodyText }}>
                    👤 {dispInstructor}さん
                  </p>
                )}
              </div>
            </div>
          </>
        );
      })()}

      <footer className="text-center text-xs text-stone-400 py-8 px-4 border-t border-stone-200 mt-8 dark:border-stone-800">
        <p>このサイトはNAS・BLUE FITNESSの非公式ファンサイトです。</p>
        <p className="mt-1">情報は変更になる場合があります。最新情報は各施設にご確認ください。</p>
      </footer>
    </div>
    </div>
  );
}
