import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Board, Note, Stroke } from "@/types/board";
import { BoardSurface } from "@/components/Board/BoardSurface";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: board } = await supabase
    .from("boards")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Board>();

  if (!board) {
    notFound();
  }

  const [{ data: notes }, { data: strokes }] = await Promise.all([
    supabase.from("notes").select("*").eq("board_id", board.id).order("z_index"),
    supabase.from("strokes").select("*").eq("board_id", board.id).order("created_at"),
  ]);

  return (
    <BoardSurface
      board={board}
      initialNotes={(notes ?? []) as Note[]}
      initialStrokes={(strokes ?? []) as Stroke[]}
    />
  );
}
