"use client";

import { useEffect, useRef, useState } from "react";
import type { Board, Note, Point, Stroke } from "@/types/board";
import { useBoardStore } from "./useBoardStore";
import { Toolbar } from "./Toolbar";
import { BoardCanvas } from "./BoardCanvas";
import { NoteLayer } from "./NoteLayer";
import { deleteStroke, insertNote, insertStroke } from "@/lib/db";

const WORLD_W = 4000;
const WORLD_H = 3000;
const NOTE_W = 200;
const NOTE_H = 200;

type Props = {
  board: Board;
  initialNotes: Note[];
  initialStrokes: Stroke[];
};

export function BoardSurface({ board, initialNotes, initialStrokes }: Props) {
  const init = useBoardStore((s) => s.init);
  const tool = useBoardStore((s) => s.tool);
  const noteColor = useBoardStore((s) => s.noteColor);
  const startStroke = useBoardStore((s) => s.startStroke);
  const appendStrokePoint = useBoardStore((s) => s.appendStrokePoint);
  const finishStroke = useBoardStore((s) => s.finishStroke);
  const upsertNote = useBoardStore((s) => s.upsertNote);
  const removeStroke = useBoardStore((s) => s.removeStroke);
  const strokes = useBoardStore((s) => s.strokes);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef<{ pointerId: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    init(board.id, initialNotes, initialStrokes);
  }, [board.id, initialNotes, initialStrokes, init]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      left: WORLD_W / 2 - el.clientWidth / 2,
      top: WORLD_H / 2 - el.clientHeight / 2,
    });
  }, []);

  function getWorldCoords(e: React.PointerEvent<HTMLDivElement>): Point {
    const rect = worldRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function eraseAt(point: Point) {
    const list = Object.values(strokes);
    const px = point[0];
    const py = point[1];
    for (const s of list) {
      const threshold = s.width + 8;
      const t2 = threshold * threshold;
      for (const [x, y] of s.points) {
        const dx = x - px;
        const dy = y - py;
        if (dx * dx + dy * dy <= t2) {
          removeStroke(s.id);
          void deleteStroke(s.id);
          return;
        }
      }
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const point = getWorldCoords(e);

    if (tool === "pen") {
      e.preventDefault();
      const id = crypto.randomUUID();
      startStroke(id, point);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      drawingRef.current = { pointerId: e.pointerId };
      return;
    }

    if (tool === "note") {
      const note: Note = {
        id: crypto.randomUUID(),
        board_id: board.id,
        x: point[0] - NOTE_W / 2,
        y: point[1] - NOTE_H / 2,
        width: NOTE_W,
        height: NOTE_H,
        color: noteColor,
        text: "",
        z_index: Date.now() % 1_000_000,
        updated_at: new Date().toISOString(),
        updated_by: null,
      };
      upsertNote(note);
      void insertNote(note);
      return;
    }

    if (tool === "eraser") {
      eraseAt(point);
      return;
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === "pen" && drawingRef.current?.pointerId === e.pointerId) {
      appendStrokePoint(getWorldCoords(e));
      return;
    }
    if (tool === "eraser" && (e.buttons & 1) === 1) {
      eraseAt(getWorldCoords(e));
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === "pen" && drawingRef.current?.pointerId === e.pointerId) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      drawingRef.current = null;
      const finished = finishStroke();
      if (finished && finished.points.length >= 1) {
        void insertStroke(finished);
      }
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const cursorStyle =
    tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : tool === "note" ? "copy" : "default";

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

      <div className="pointer-events-none absolute left-1/2 top-14 z-30 -translate-x-1/2">
        <div className="pointer-events-auto">
          <Toolbar />
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="relative flex-1 overflow-auto"
        style={{ background: "#f4f4f5" }}
      >
        <div
          ref={worldRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative"
          style={{
            width: WORLD_W,
            height: WORLD_H,
            backgroundImage:
              "radial-gradient(circle at 20px 20px, rgba(0,0,0,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            cursor: cursorStyle,
            touchAction: "none",
          }}
        >
          <BoardCanvas width={WORLD_W} height={WORLD_H} />
          <NoteLayer />
        </div>
      </div>
    </div>
  );
}
