"use client";

import { create } from "zustand";
import type { Note, NoteColor, NoteVote, Point, Stroke, StrokeColor, Tool } from "@/types/board";

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

export type VoteSummary = { up: number; down: number };
export type ToggleVoteResult =
  | { action: "clear" }
  | { action: "set"; value: 1 | -1 };

type BoardState = {
  boardId: string;
  clientId: string;
  notes: Record<string, Note>;
  strokes: Record<string, Stroke>;
  remotePendingStrokes: Record<string, Stroke>;
  votes: Record<string, Record<string, 1 | -1>>;
  voteSummary: Record<string, VoteSummary>;
  myVote: Record<string, 1 | -1>;
  tool: Tool;
  noteColor: NoteColor;
  strokeColor: StrokeColor;
  strokeWidth: number;
  pendingStroke: Stroke | null;
  draggingNoteId: string | null;
  selectedNoteIds: string[];
  marquee: { x: number; y: number; w: number; h: number } | null;
  scale: number;

  init: (
    boardId: string,
    clientId: string,
    notes: Note[],
    strokes: Stroke[],
    votes: NoteVote[]
  ) => void;

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

  // Selection / marquee
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  setMarquee: (rect: { x: number; y: number; w: number; h: number } | null) => void;

  // Remote ephemeral (in-progress) strokes from other users
  upsertRemotePendingStroke: (s: Stroke) => void;
  removeRemotePendingStroke: (id: string) => void;

  // Votes
  applyVote: (vote: NoteVote) => void;
  clearVote: (noteId: string, userId: string) => void;
  toggleVote: (noteId: string, value: 1 | -1) => ToggleVoteResult | null;
};

export const useBoardStore = create<BoardState>((set, get) => ({
  boardId: "",
  clientId: "",
  notes: {},
  strokes: {},
  remotePendingStrokes: {},
  votes: {},
  voteSummary: {},
  myVote: {},
  tool: "select",
  noteColor: "yellow",
  strokeColor: "black",
  strokeWidth: 3,
  pendingStroke: null,
  draggingNoteId: null,
  selectedNoteIds: [],
  marquee: null,
  scale: 1,

  init: (boardId, clientId, notes, strokes, votes) => {
    const noteMap: Record<string, Note> = {};
    for (const n of notes) noteMap[n.id] = n;
    const strokeMap: Record<string, Stroke> = {};
    for (const s of strokes) strokeMap[s.id] = s;
    const voteMap: Record<string, Record<string, 1 | -1>> = {};
    const summaryMap: Record<string, VoteSummary> = {};
    const myVoteMap: Record<string, 1 | -1> = {};
    for (const v of votes) {
      const inner = voteMap[v.note_id] ?? (voteMap[v.note_id] = {});
      inner[v.user_id] = v.value;
      const sum = summaryMap[v.note_id] ?? (summaryMap[v.note_id] = { up: 0, down: 0 });
      if (v.value === 1) sum.up++;
      else sum.down++;
      if (v.user_id === clientId) myVoteMap[v.note_id] = v.value;
    }
    set({
      boardId,
      clientId,
      notes: noteMap,
      strokes: strokeMap,
      votes: voteMap,
      voteSummary: summaryMap,
      myVote: myVoteMap,
    });
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
      const nextNotes = { ...state.notes };
      delete nextNotes[id];
      const nextSelection = state.selectedNoteIds.includes(id)
        ? state.selectedNoteIds.filter((s) => s !== id)
        : state.selectedNoteIds;
      return { notes: nextNotes, selectedNoteIds: nextSelection };
    }),

  setDraggingNoteId: (draggingNoteId) => set({ draggingNoteId }),

  setSelection: (ids) => set({ selectedNoteIds: ids }),
  clearSelection: () => set({ selectedNoteIds: [] }),
  setMarquee: (marquee) => set({ marquee }),

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

  applyVote: (vote) =>
    set((state) => {
      const prev = state.votes[vote.note_id]?.[vote.user_id];
      if (prev === vote.value) return state;

      const innerNext = { ...(state.votes[vote.note_id] ?? {}), [vote.user_id]: vote.value };
      const nextVotes = { ...state.votes, [vote.note_id]: innerNext };

      const cur = state.voteSummary[vote.note_id] ?? { up: 0, down: 0 };
      let up = cur.up;
      let down = cur.down;
      if (prev === 1) up--;
      else if (prev === -1) down--;
      if (vote.value === 1) up++;
      else down++;
      const nextSummary = { ...state.voteSummary, [vote.note_id]: { up, down } };

      let nextMyVote = state.myVote;
      if (vote.user_id === state.clientId) {
        nextMyVote = { ...state.myVote, [vote.note_id]: vote.value };
      }

      return { votes: nextVotes, voteSummary: nextSummary, myVote: nextMyVote };
    }),

  clearVote: (noteId, userId) =>
    set((state) => {
      const prev = state.votes[noteId]?.[userId];
      if (prev === undefined) return state;

      const innerNext = { ...(state.votes[noteId] ?? {}) };
      delete innerNext[userId];
      const nextVotes = { ...state.votes };
      if (Object.keys(innerNext).length === 0) delete nextVotes[noteId];
      else nextVotes[noteId] = innerNext;

      const cur = state.voteSummary[noteId] ?? { up: 0, down: 0 };
      let up = cur.up;
      let down = cur.down;
      if (prev === 1) up--;
      else down--;
      const nextSummary = { ...state.voteSummary };
      if (up === 0 && down === 0) delete nextSummary[noteId];
      else nextSummary[noteId] = { up, down };

      let nextMyVote = state.myVote;
      if (userId === state.clientId && state.myVote[noteId] !== undefined) {
        nextMyVote = { ...state.myVote };
        delete nextMyVote[noteId];
      }

      return { votes: nextVotes, voteSummary: nextSummary, myVote: nextMyVote };
    }),

  toggleVote: (noteId, value) => {
    const { clientId, boardId, myVote } = get();
    if (!clientId) return null;
    const current = myVote[noteId];
    if (current === value) {
      get().clearVote(noteId, clientId);
      return { action: "clear" };
    }
    get().applyVote({
      note_id: noteId,
      user_id: clientId,
      board_id: boardId,
      value,
      updated_at: new Date().toISOString(),
    });
    return { action: "set", value };
  },
}));
