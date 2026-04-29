"use client";

import { useEffect, useRef } from "react";
import { useBoardStore } from "./useBoardStore";
import { NOTE_BG, NOTE_BG_DARK } from "@/lib/colors";
import { deleteNote, deleteNoteVote, updateNote, upsertNoteVote } from "@/lib/db";
import type { Note } from "@/types/board";

type Props = {
  note: Note;
};

type DragNote = { id: string; originX: number; originY: number };

export function StickyNote({ note }: Props) {
  const tool = useBoardStore((s) => s.tool);
  const patchNote = useBoardStore((s) => s.patchNote);
  const removeNote = useBoardStore((s) => s.removeNote);
  const setDraggingNoteId = useBoardStore((s) => s.setDraggingNoteId);
  const isSelected = useBoardStore((s) => s.selectedNoteIds.includes(note.id));
  const summary = useBoardStore((s) => s.voteSummary[note.id]);
  const myVote = useBoardStore((s) => s.myVote[note.id]);
  const toggleVote = useBoardStore((s) => s.toggleVote);
  const clientId = useBoardStore((s) => s.clientId);
  const boardId = useBoardStore((s) => s.boardId);

  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scaleAtStart: number;
    notes: DragNote[];
  } | null>(null);

  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    return () => {
      if (textTimer.current) clearTimeout(textTimer.current);
    };
  }, []);

  function handleHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === "eraser") {
      e.stopPropagation();
      removeNote(note.id);
      void deleteNote(note.id);
      return;
    }
    if (tool !== "select") return;
    e.stopPropagation();

    const state = useBoardStore.getState();
    let dragIds: string[];
    if (state.selectedNoteIds.includes(note.id)) {
      dragIds = state.selectedNoteIds;
    } else {
      state.setSelection([note.id]);
      dragIds = [note.id];
    }

    const dragNotes: DragNote[] = [];
    for (const id of dragIds) {
      const n = state.notes[id];
      if (n) dragNotes.push({ id: n.id, originX: n.x, originY: n.y });
    }

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scaleAtStart: state.scale,
      notes: dragNotes,
    };
    setDraggingNoteId(note.id);
  }

  function handleHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragState.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    const dx = (e.clientX - ds.startX) / ds.scaleAtStart;
    const dy = (e.clientY - ds.startY) / ds.scaleAtStart;
    for (const n of ds.notes) {
      patchNote(n.id, { x: n.originX + dx, y: n.originY + dy });
    }
  }

  function handleHeaderPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragState.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    const finished = ds.notes;
    dragState.current = null;
    setDraggingNoteId(null);
    const stateNotes = useBoardStore.getState().notes;
    for (const n of finished) {
      const cur = stateNotes[n.id];
      if (cur) void updateNote(n.id, { x: cur.x, y: cur.y });
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    patchNote(note.id, { text });
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      void updateNote(note.id, { text });
    }, 400);
  }

  function wrapSelection(marker: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const newText =
      value.slice(0, start) + marker + value.slice(start, end) + marker + value.slice(end);
    patchNote(note.id, { text: newText });
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      void updateNote(note.id, { text: newText });
    }, 400);
    const cursorStart = start + marker.length;
    const cursorEnd = end + marker.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  function handleTextKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      wrapSelection("**");
    } else if (key === "i") {
      e.preventDefault();
      wrapSelection("*");
    }
  }

  function handleTextBlur() {
    if (textTimer.current) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
    }
    void updateNote(note.id, { text: note.text });
  }

  function handleVote(value: 1 | -1) {
    if (!clientId || !boardId) return;
    const result = toggleVote(note.id, value);
    if (!result) return;
    if (result.action === "clear") {
      void deleteNoteVote(note.id, clientId);
    } else {
      void upsertNoteVote({
        note_id: note.id,
        user_id: clientId,
        board_id: boardId,
        value: result.value,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return (
    <div
      className={`absolute flex flex-col rounded shadow-md transition-shadow ${NOTE_BG[note.color]} ${
        isSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""
      }`}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        zIndex: note.z_index + 1,
        pointerEvents: tool === "pen" ? "none" : "auto",
        cursor: tool === "eraser" ? "not-allowed" : "default",
      }}
    >
      <div
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
        className={`h-5 rounded-t cursor-grab active:cursor-grabbing ${NOTE_BG_DARK[note.color]}`}
        style={{ touchAction: "none" }}
      />
      <textarea
        ref={textareaRef}
        value={note.text}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        onKeyDown={handleTextKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        readOnly={tool !== "select"}
        placeholder="Type something..."
        className="flex-1 resize-none bg-transparent p-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500/60"
      />
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="flex items-center gap-1 border-t border-black/10 px-1.5 py-1"
      >
        <button
          type="button"
          onClick={() => handleVote(1)}
          aria-pressed={myVote === 1}
          aria-label="Upvote"
          title="Upvote"
          className={`flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium transition ${
            myVote === 1
              ? "bg-emerald-600 text-white"
              : "text-zinc-700 hover:bg-black/5"
          }`}
        >
          <span aria-hidden>▲</span>
          <span className="tabular-nums">{summary?.up ?? 0}</span>
        </button>
        <button
          type="button"
          onClick={() => handleVote(-1)}
          aria-pressed={myVote === -1}
          aria-label="Downvote"
          title="Downvote"
          className={`flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium transition ${
            myVote === -1
              ? "bg-rose-600 text-white"
              : "text-zinc-700 hover:bg-black/5"
          }`}
        >
          <span aria-hidden>▼</span>
          <span className="tabular-nums">{summary?.down ?? 0}</span>
        </button>
      </div>
    </div>
  );
}
