"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Board, Note, NoteVote, Point, Stroke } from "@/types/board";
import { MAX_SCALE, MIN_SCALE, useBoardStore } from "./useBoardStore";
import { Toolbar } from "./Toolbar";
import { BoardCanvas } from "./BoardCanvas";
import { NoteLayer } from "./NoteLayer";
import { PresenceCursors } from "./PresenceCursors";
import { ZoomControls } from "./ZoomControls";
import { useBoardRealtime } from "./useBoardRealtime";
import { UserMenu } from "@/components/UserMenu";
import { deleteNote, deleteStroke, insertNote, insertStroke } from "@/lib/db";
import { colorForUser, type Identity } from "@/lib/identity";

const WORLD_W = 4000;
const WORLD_H = 3000;
const NOTE_W = 200;
const NOTE_H = 200;
const ZOOM_STEP = 1.25;
const FIT_PADDING = 80;

type Props = {
  board: Board;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userAvatarUrl: string | null;
  initialNotes: Note[];
  initialStrokes: Stroke[];
  initialVotes: NoteVote[];
};

export function BoardSurface({
  board,
  userId,
  userName,
  userEmail,
  userAvatarUrl,
  initialNotes,
  initialStrokes,
  initialVotes,
}: Props) {
  const init = useBoardStore((s) => s.init);
  const tool = useBoardStore((s) => s.tool);
  const noteColor = useBoardStore((s) => s.noteColor);
  const startStroke = useBoardStore((s) => s.startStroke);
  const appendStrokePoint = useBoardStore((s) => s.appendStrokePoint);
  const finishStroke = useBoardStore((s) => s.finishStroke);
  const upsertNote = useBoardStore((s) => s.upsertNote);
  const removeStroke = useBoardStore((s) => s.removeStroke);
  const removeNote = useBoardStore((s) => s.removeNote);
  const strokes = useBoardStore((s) => s.strokes);
  const scale = useBoardStore((s) => s.scale);
  const setScale = useBoardStore((s) => s.setScale);
  const marquee = useBoardStore((s) => s.marquee);
  const setMarquee = useBoardStore((s) => s.setMarquee);
  const setSelection = useBoardStore((s) => s.setSelection);
  const clearSelection = useBoardStore((s) => s.clearSelection);

  const identity = useMemo<Identity>(
    () => ({
      clientId: userId,
      name: userName ?? userEmail ?? "Friend",
      color: colorForUser(userId),
    }),
    [userId, userName, userEmail],
  );

  const { remoteCursors, broadcastCursor, broadcastStrokePoint, broadcastStrokeEnd } =
    useBoardRealtime(board.id, identity);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef<{ pointerId: number } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const pendingScrollRef = useRef<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    init(board.id, userId, initialNotes, initialStrokes, initialVotes);
  }, [board.id, userId, initialNotes, initialStrokes, initialVotes, init]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      left: WORLD_W / 2 - el.clientWidth / 2,
      top: WORLD_H / 2 - el.clientHeight / 2,
    });
  }, []);

  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft = pending.x;
      scroller.scrollTop = pending.y;
    }
    pendingScrollRef.current = null;
  }, [scale]);

  function getWorldCoords(e: React.PointerEvent<HTMLDivElement>): Point {
    const rect = worldRef.current!.getBoundingClientRect();
    const s = useBoardStore.getState().scale;
    return [(e.clientX - rect.left) / s, (e.clientY - rect.top) / s];
  }

  function eraseAt(point: Point) {
    const list = Object.values(strokes);
    const px = point[0];
    const py = point[1];
    const s = useBoardStore.getState().scale;
    for (const stroke of list) {
      const threshold = stroke.width + 8 / s;
      const t2 = threshold * threshold;
      for (const [x, y] of stroke.points) {
        const dx = x - px;
        const dy = y - py;
        if (dx * dx + dy * dy <= t2) {
          removeStroke(stroke.id);
          void deleteStroke(stroke.id);
          return;
        }
      }
    }
  }

  function zoomAt(clientX: number, clientY: number, nextScale: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const current = useBoardStore.getState().scale;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    if (next === current) return;
    const worldX = (scroller.scrollLeft + mx) / current;
    const worldY = (scroller.scrollTop + my) / current;
    pendingScrollRef.current = {
      x: worldX * next - mx,
      y: worldY * next - my,
    };
    setScale(next);
  }

  function zoomAtCenter(nextScale: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextScale);
  }

  function resetZoom() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const current = useBoardStore.getState().scale;
    const targetX = WORLD_W / 2 - scroller.clientWidth / 2;
    const targetY = WORLD_H / 2 - scroller.clientHeight / 2;
    if (current !== 1) {
      pendingScrollRef.current = { x: targetX, y: targetY };
      setScale(1);
    } else {
      scroller.scrollLeft = targetX;
      scroller.scrollTop = targetY;
    }
  }

  function fitToContent() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const state = useBoardStore.getState();
    const allNotes = Object.values(state.notes);
    const allStrokes = Object.values(state.strokes);
    if (allNotes.length === 0 && allStrokes.length === 0) {
      resetZoom();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of allNotes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.width > maxX) maxX = n.x + n.width;
      if (n.y + n.height > maxY) maxY = n.y + n.height;
    }
    for (const s of allStrokes) {
      for (const [x, y] of s.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    const bboxW = maxX - minX + FIT_PADDING * 2;
    const bboxH = maxY - minY + FIT_PADDING * 2;
    const fitScale = Math.min(scroller.clientWidth / bboxW, scroller.clientHeight / bboxH, 1);
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitScale));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const target = {
      x: cx * next - scroller.clientWidth / 2,
      y: cy * next - scroller.clientHeight / 2,
    };
    if (next === state.scale) {
      scroller.scrollLeft = target.x;
      scroller.scrollTop = target.y;
    } else {
      pendingScrollRef.current = target;
      setScale(next);
    }
  }

  // Wheel zoom — attached once via addEventListener so we can preventDefault.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const handler = (e: WheelEvent) => {
      // Trackpad pinch is ctrlKey (synthetic); Mac Cmd+wheel is metaKey.
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const state = useBoardStore.getState();
      // Don't zoom mid-drag/draw.
      if (state.pendingStroke || state.draggingNoteId) return;
      // Normalize deltaMode: line=1, page=2.
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= scroller.clientHeight;
      const factor = Math.exp(-dy * 0.0015);
      zoomAt(e.clientX, e.clientY, state.scale * factor);
    };
    scroller.addEventListener("wheel", handler, { passive: false });
    return () => scroller.removeEventListener("wheel", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard zoom shortcuts (Cmd/Ctrl + =/-/0).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomAtCenter(useBoardStore.getState().scale * ZOOM_STEP);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomAtCenter(useBoardStore.getState().scale / ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Delete / Backspace removes selected notes (unless typing in a textarea/input).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return;
      const ids = useBoardStore.getState().selectedNoteIds;
      if (ids.length === 0) return;
      e.preventDefault();
      for (const id of ids) {
        removeNote(id);
        void deleteNote(id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [removeNote]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const point = getWorldCoords(e);

    if (tool === "pen") {
      e.preventDefault();
      const id = crypto.randomUUID();
      startStroke(id, point);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      drawingRef.current = { pointerId: e.pointerId };
      const pending = useBoardStore.getState().pendingStroke;
      if (pending) broadcastStrokePoint(pending);
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
        updated_by: userId,
      };
      upsertNote(note);
      void insertNote(note);
      return;
    }

    if (tool === "eraser") {
      eraseAt(point);
      return;
    }

    if (tool === "select") {
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      marqueeRef.current = { pointerId: e.pointerId, startX: point[0], startY: point[1] };
      clearSelection();
      setMarquee({ x: point[0], y: point[1], w: 0, h: 0 });
      return;
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const point = getWorldCoords(e);
    broadcastCursor(point);

    if (tool === "pen" && drawingRef.current?.pointerId === e.pointerId) {
      appendStrokePoint(point);
      const pending = useBoardStore.getState().pendingStroke;
      if (pending) broadcastStrokePoint(pending);
      return;
    }
    if (tool === "eraser" && (e.buttons & 1) === 1) {
      eraseAt(point);
      return;
    }
    if (tool === "select" && marqueeRef.current?.pointerId === e.pointerId) {
      const startX = marqueeRef.current.startX;
      const startY = marqueeRef.current.startY;
      const x = Math.min(startX, point[0]);
      const y = Math.min(startY, point[1]);
      const w = Math.abs(point[0] - startX);
      const h = Math.abs(point[1] - startY);
      setMarquee({ x, y, w, h });
      const ids: string[] = [];
      const notes = useBoardStore.getState().notes;
      for (const n of Object.values(notes)) {
        if (n.x < x + w && n.x + n.width > x && n.y < y + h && n.y + n.height > y) {
          ids.push(n.id);
        }
      }
      setSelection(ids);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === "pen" && drawingRef.current?.pointerId === e.pointerId) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      drawingRef.current = null;
      const finished = finishStroke();
      if (finished && finished.points.length >= 1) {
        void insertStroke(finished);
        broadcastStrokeEnd(finished.id);
      }
      return;
    }
    if (tool === "select" && marqueeRef.current?.pointerId === e.pointerId) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      marqueeRef.current = null;
      setMarquee(null);
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
          <a href="/" className="font-semibold text-zinc-900 hover:underline">
            IdeaBoard
          </a>
          <span className="text-sm text-zinc-500">/b/{board.slug}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={copyLink}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm hover:bg-zinc-50"
          >
            {copied ? "Copied!" : "Copy share link"}
          </button>
          <UserMenu name={userName} email={userEmail} avatarUrl={userAvatarUrl} />
        </div>
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
        <div style={{ width: WORLD_W * scale, height: WORLD_H * scale }}>
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
              transformOrigin: "0 0",
              transform: `scale(${scale})`,
              backgroundImage:
                "radial-gradient(circle at 20px 20px, rgba(0,0,0,0.06) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              cursor: cursorStyle,
              touchAction: "none",
            }}
          >
            <BoardCanvas width={WORLD_W} height={WORLD_H} />
            <NoteLayer />
            {marquee ? (
              <div
                className="pointer-events-none absolute z-20 border border-blue-500 bg-blue-500/10"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                }}
              />
            ) : null}
            <PresenceCursors cursors={remoteCursors} />
          </div>
        </div>
      </div>

      <ZoomControls
        onZoomIn={() => zoomAtCenter(useBoardStore.getState().scale * ZOOM_STEP)}
        onZoomOut={() => zoomAtCenter(useBoardStore.getState().scale / ZOOM_STEP)}
        onReset={resetZoom}
        onFit={fitToContent}
      />
    </div>
  );
}
