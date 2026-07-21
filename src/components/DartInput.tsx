"use client";

import { useState } from "react";
import { DART_NUMBERS, parseDart } from "@/game/darts";

type Multiplier = "S" | "D" | "T";

const MULTIPLIERS: { value: Multiplier; label: string }[] = [
  { value: "S", label: "Single" },
  { value: "D", label: "Double" },
  { value: "T", label: "Triple" },
];

/**
 * Touch numpad for entering a turn's darts. Tap a multiplier (Single is the
 * default and stays selected), then a number — fills the next empty slot and
 * emits the segment key (e.g. "D20"), never a reduced point value. Bulls and
 * MISS bypass the multiplier entirely. Renders exactly `darts.length` slots so
 * afflictions like reducedDarts shrink the pad automatically.
 */
export function ThreeDartInput({
  darts,
  onSet,
  onSubmit,
  submitLabel,
  disabled,
}: {
  darts: (string | null)[];
  onSet: (index: number, raw: string | null) => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Multiplier>("S");

  const total = darts.reduce((s, d) => s + (d ? parseDart(d).baseScore : 0), 0);
  const nextIndex = darts.findIndex((d) => d === null);
  let lastFilledIndex = -1;
  for (let i = darts.length - 1; i >= 0; i--) {
    if (darts[i] !== null) {
      lastFilledIndex = i;
      break;
    }
  }
  const full = nextIndex === -1;

  const fill = (raw: string, resetMode: boolean) => {
    if (full) return;
    onSet(nextIndex, raw);
    if (resetMode && mode !== "S") setMode("S");
  };

  const undo = () => {
    if (lastFilledIndex === -1) return;
    onSet(lastFilledIndex, null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${darts.length}, minmax(0, 1fr))` }}>
        {darts.map((d, i) => (
          <div
            key={i}
            className={`min-h-11 rounded-md border px-2 py-2 text-center text-sm font-semibold ${
              i === nextIndex
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            {d ?? "–"}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MULTIPLIERS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`min-h-11 rounded-md border text-sm font-semibold transition-colors ${
              mode === m.value
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {DART_NUMBERS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => fill(`${mode}${n}`, true)}
            disabled={full}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-800 text-base font-semibold text-slate-100 transition-colors hover:border-emerald-500 disabled:opacity-40"
          >
            {n}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => fill("OB", false)}
          disabled={full}
          className="min-h-11 rounded-md border border-emerald-700 bg-emerald-900/40 text-sm font-semibold text-emerald-200 disabled:opacity-40"
        >
          25
        </button>
        <button
          type="button"
          onClick={() => fill("IB", false)}
          disabled={full}
          className="min-h-11 rounded-md border border-rose-700 bg-rose-900/40 text-sm font-semibold text-rose-200 disabled:opacity-40"
        >
          50
        </button>
        <button
          type="button"
          onClick={() => fill("MISS", false)}
          disabled={full}
          className="min-h-11 rounded-md border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300 disabled:opacity-40"
        >
          MISS
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={lastFilledIndex === -1}
          className="min-h-11 rounded-md border border-amber-700 bg-amber-900/30 text-sm font-semibold text-amber-200 disabled:opacity-40"
        >
          ⌫ Undo
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          Raw turn total: <b className="text-slate-100">{total}</b>
        </span>
        <button className="btn-primary min-h-11" onClick={onSubmit} disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
