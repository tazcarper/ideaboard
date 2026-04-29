"use client";

import { useBoardStore } from "./useBoardStore";

type Props = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
};

function formatPct(scale: number): string {
  const pct = scale * 100;
  return pct < 50 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

export function ZoomControls({ onZoomIn, onZoomOut, onReset, onFit }: Props) {
  const scale = useBoardStore((s) => s.scale);

  const btn =
    "flex h-8 w-8 items-center justify-center rounded-full text-base text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40";

  return (
    <div className="fixed bottom-4 right-4 z-30 flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 shadow-md">
      <button onClick={onZoomOut} className={btn} title="Zoom out (Cmd/Ctrl + -)" aria-label="Zoom out">
        −
      </button>
      <button
        onClick={onReset}
        title="Reset zoom (Cmd/Ctrl + 0)"
        aria-label="Reset zoom"
        className="min-w-14 rounded-full px-2 py-1 text-sm tabular-nums text-zinc-700 transition hover:bg-zinc-100"
      >
        {formatPct(scale)}
      </button>
      <button onClick={onZoomIn} className={btn} title="Zoom in (Cmd/Ctrl + =)" aria-label="Zoom in">
        +
      </button>
      <div className="mx-1 h-5 w-px bg-zinc-200" />
      <button
        onClick={onFit}
        title="Fit to content"
        aria-label="Fit to content"
        className="rounded-full px-3 py-1 text-sm text-zinc-700 transition hover:bg-zinc-100"
      >
        ⤢ Fit
      </button>
    </div>
  );
}
