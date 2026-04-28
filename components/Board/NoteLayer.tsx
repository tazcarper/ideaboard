"use client";

import { useBoardStore } from "./useBoardStore";
import { StickyNote } from "./StickyNote";

export function NoteLayer() {
  const notes = useBoardStore((s) => s.notes);
  const list = Object.values(notes);

  return (
    <>
      {list.map((n) => (
        <StickyNote key={n.id} note={n} />
      ))}
    </>
  );
}
