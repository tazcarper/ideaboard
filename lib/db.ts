"use client";

import { createClient } from "@/lib/supabase/client";
import type { Note, Stroke } from "@/types/board";

const supabase = createClient();

export async function insertNote(note: Note) {
  const { error } = await supabase.from("notes").insert(note);
  if (error) console.error("insertNote", error);
}

export async function updateNote(id: string, patch: Partial<Note>) {
  const { error } = await supabase.from("notes").update(patch).eq("id", id);
  if (error) console.error("updateNote", error);
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) console.error("deleteNote", error);
}

export async function insertStroke(stroke: Stroke) {
  const { error } = await supabase.from("strokes").insert(stroke);
  if (error) console.error("insertStroke", error);
}

export async function deleteStroke(id: string) {
  const { error } = await supabase.from("strokes").delete().eq("id", id);
  if (error) console.error("deleteStroke", error);
}
