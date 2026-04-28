"use client";

import { useBoardStore } from "./useBoardStore";
import { NOTE_COLORS, NOTE_SWATCH, STROKE_COLORS, STROKE_HEX } from "@/lib/colors";
import type { Tool } from "@/types/board";

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "pen", label: "Pen", icon: "✎" },
  { id: "note", label: "Note", icon: "▢" },
  { id: "eraser", label: "Eraser", icon: "⌫" },
];

export function Toolbar() {
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);
  const noteColor = useBoardStore((s) => s.noteColor);
  const setNoteColor = useBoardStore((s) => s.setNoteColor);
  const strokeColor = useBoardStore((s) => s.strokeColor);
  const setStrokeColor = useBoardStore((s) => s.setStrokeColor);

  return (
    <div className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white px-3 py-2 shadow-md">
      <div className="flex gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.label}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${
              tool === t.id ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"
            }`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {tool === "pen" ? (
        <>
          <div className="h-6 w-px bg-zinc-200" />
          <div className="flex gap-1">
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setStrokeColor(c)}
                title={c}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  strokeColor === c ? "border-zinc-900" : "border-transparent hover:border-zinc-300"
                }`}
                style={{ backgroundColor: STROKE_HEX[c] }}
              />
            ))}
          </div>
        </>
      ) : null}

      {tool === "note" ? (
        <>
          <div className="h-6 w-px bg-zinc-200" />
          <div className="flex gap-1">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNoteColor(c)}
                title={c}
                className={`h-7 w-7 rounded border-2 transition ${
                  noteColor === c ? "border-zinc-900" : "border-transparent hover:border-zinc-300"
                }`}
                style={{ backgroundColor: NOTE_SWATCH[c] }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
