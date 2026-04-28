"use client";

import { useState } from "react";
import type { Board, Note, Stroke } from "@/types/board";

type Props = {
  board: Board;
  initialNotes: Note[];
  initialStrokes: Stroke[];
};

export function BoardSurface({ board, initialNotes, initialStrokes }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-zinc-900">IdeaBoard</span>
          <span className="text-sm text-zinc-500">/b/{board.slug}</span>
        </div>
        <button
          onClick={copyLink}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm hover:bg-zinc-50"
        >
          {copied ? "Copied!" : "Copy share link"}
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
          <div className="text-center">
            <p className="text-lg">Board surface coming in Phase 2.</p>
            <p className="mt-2 text-sm">
              {initialNotes.length} notes, {initialStrokes.length} strokes loaded.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
