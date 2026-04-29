"use client";

import { useEffect, useRef } from "react";
import { useBoardStore } from "./useBoardStore";
import { NOTE_BG, NOTE_BG_DARK } from "@/lib/colors";
import { deleteNote, updateNote } from "@/lib/db";
import type { Note } from "@/types/board";

type Props = {
  note: Note;
};

export function StickyNote({ note }: Props) {
  const tool = useBoardStore((s) => s.tool);
  const patchNote = useBoardStore((s) => s.patchNote);
  const removeNote = useBoardStore((s) => s.removeNote);
  const setDraggingNoteId = useBoardStore((s) => s.setDraggingNoteId);

  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    scaleAtStart: number;
  } | null>(null);

  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: note.x,
      originY: note.y,
      scaleAtStart: useBoardStore.getState().scale,
    };
    setDraggingNoteId(note.id);
  }

  function handleHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragState.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    const dx = (e.clientX - ds.startX) / ds.scaleAtStart;
    const dy = (e.clientY - ds.startY) / ds.scaleAtStart;
    patchNote(note.id, { x: ds.originX + dx, y: ds.originY + dy });
  }

  function handleHeaderPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const ds = dragState.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    dragState.current = null;
    setDraggingNoteId(null);
    void updateNote(note.id, { x: note.x, y: note.y });
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    patchNote(note.id, { text });
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      void updateNote(note.id, { text });
    }, 400);
  }

  function handleTextBlur() {
    if (textTimer.current) {
      clearTimeout(textTimer.current);
      textTimer.current = null;
    }
    void updateNote(note.id, { text: note.text });
  }

  return (
    <div
      className={`absolute flex flex-col rounded shadow-md ${NOTE_BG[note.color]}`}
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
        value={note.text}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        onPointerDown={(e) => e.stopPropagation()}
        readOnly={tool !== "select"}
        placeholder="Type something..."
        className="flex-1 resize-none bg-transparent p-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500/60"
      />
    </div>
  );
}
