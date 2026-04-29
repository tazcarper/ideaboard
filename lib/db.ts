"use client";

import { createClient } from "@/lib/supabase/client";
import type { Note, NoteVote, Stroke } from "@/types/board";

export async function insertNote(note: Note) {
  const supabase = createClient();
  const { error } = await supabase.from("notes").insert(note);
  if (error) console.error("insertNote", error);
}

export async function updateNote(id: string, patch: Partial<Note>, userId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("notes")
    .update({ ...patch, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("updateNote", error);
}

export async function deleteNote(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) console.error("deleteNote", error);
}

export async function insertStroke(stroke: Stroke) {
  const supabase = createClient();
  const { error } = await supabase.from("strokes").insert(stroke);
  if (error) console.error("insertStroke", error);
}

export async function deleteStroke(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("strokes").delete().eq("id", id);
  if (error) console.error("deleteStroke", error);
}

export async function upsertNoteVote(vote: NoteVote) {
  const supabase = createClient();
  const { error } = await supabase
    .from("note_votes")
    .upsert(vote, { onConflict: "note_id,user_id" });
  if (error) console.error("upsertNoteVote", error);
}

export async function deleteNoteVote(noteId: string, userId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("note_votes")
    .delete()
    .eq("note_id", noteId)
    .eq("user_id", userId);
  if (error) console.error("deleteNoteVote", error);
}
