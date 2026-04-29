"use client";

import { create } from "zustand";
import type { Note, NoteColor, Point, Stroke, StrokeColor, Tool } from "@/types/board";

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

type BoardState = {
  boardId: string;
  clientId: string;
  notes: Record<string, Note>;
  strokes: Record<string, Stroke>;
  remotePendingStrokes: Record<string, Stroke>;
  tool: Tool;
  noteColor: NoteColor;
  strokeColor: StrokeColor;
  strokeWidth: number;
  pendingStroke: Stroke | null;
  draggingNoteId: string | null;
  scale: number;

  init: (boardId: string, clientId: string, notes: Note[], strokes: Stroke[]) => void;

  setTool: (tool: Tool) => void;
  setNoteColor: (c: NoteColor) => void;
  setStrokeColor: (c: StrokeColor) => void;
  setScale: (s: number) => void;

  // Stroke actions
  startStroke: (id: string, point: Point) => void;
  appendStrokePoint: (point: Point) => void;
  finishStroke: () => Stroke | null;
  upsertStroke: (s: Stroke) => void;
  removeStroke: (id: string) => void;

  // Note actions
  upsertNote: (n: Note) => void;
  patchNote: (id: string, patch: Partial<Note>) => Note | null;
  removeNote: (id: string) => void;
  setDraggingNoteId: (id: string | null) => void;

  // Remote ephemeral (in-progress) strokes from other users
  upsertRemotePendingStroke: (s: Stroke) => void;
  removeRemotePendingStroke: (id: string) => void;
};

export const useBoardStore = create<BoardState>((set, get) => ({
  boardId: "",
  clientId: "",
  notes: {},
  strokes: {},
  remotePendingStrokes: {},
  tool: "select",
  noteColor: "yellow",
  strokeColor: "black",
  strokeWidth: 3,
  pendingStroke: null,
  draggingNoteId: null,
  scale: 1,

  init: (boardId, clientId, notes, strokes) => {
    const noteMap: Record<string, Note> = {};
    for (const n of notes) noteMap[n.id] = n;
    const strokeMap: Record<string, Stroke> = {};
    for (const s of strokes) strokeMap[s.id] = s;
    set({ boardId, clientId, notes: noteMap, strokes: strokeMap });
  },

  setTool: (tool) => set({ tool }),
  setNoteColor: (noteColor) => set({ noteColor }),
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setScale: (s) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    if (clamped === get().scale) return;
    set({ scale: clamped });
  },

  startStroke: (id, point) => {
    const { boardId, clientId, strokeColor, strokeWidth } = get();
    set({
      pendingStroke: {
        id,
        board_id: boardId,
        color: strokeColor,
        width: strokeWidth,
        points: [point],
        created_at: new Date().toISOString(),
        created_by: clientId || null,
      },
    });
  },

  appendStrokePoint: (point) => {
    const { pendingStroke } = get();
    if (!pendingStroke) return;
    const last = pendingStroke.points[pendingStroke.points.length - 1];
    if (last) {
      const dx = point[0] - last[0];
      const dy = point[1] - last[1];
      if (dx * dx + dy * dy < 4) return; // skip points closer than 2px
    }
    set({
      pendingStroke: {
        ...pendingStroke,
        points: [...pendingStroke.points, point],
      },
    });
  },

  finishStroke: () => {
    const { pendingStroke } = get();
    if (!pendingStroke) return null;
    set((state) => ({
      pendingStroke: null,
      strokes: { ...state.strokes, [pendingStroke.id]: pendingStroke },
    }));
    return pendingStroke;
  },

  upsertStroke: (s) =>
    set((state) => ({ strokes: { ...state.strokes, [s.id]: s } })),

  removeStroke: (id) =>
    set((state) => {
      if (!state.strokes[id]) return state;
      const next = { ...state.strokes };
      delete next[id];
      return { strokes: next };
    }),

  upsertNote: (n) =>
    set((state) => ({ notes: { ...state.notes, [n.id]: n } })),

  patchNote: (id, patch) => {
    const existing = get().notes[id];
    if (!existing) return null;
    const updated: Note = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: get().clientId || existing.updated_by,
    };
    set((state) => ({ notes: { ...state.notes, [id]: updated } }));
    return updated;
  },

  removeNote: (id) =>
    set((state) => {
      if (!state.notes[id]) return state;
      const next = { ...state.notes };
      delete next[id];
      return { notes: next };
    }),

  setDraggingNoteId: (draggingNoteId) => set({ draggingNoteId }),

  upsertRemotePendingStroke: (s) =>
    set((state) => ({
      remotePendingStrokes: { ...state.remotePendingStrokes, [s.id]: s },
    })),

  removeRemotePendingStroke: (id) =>
    set((state) => {
      if (!state.remotePendingStrokes[id]) return state;
      const next = { ...state.remotePendingStrokes };
      delete next[id];
      return { remotePendingStrokes: next };
    }),
}));
