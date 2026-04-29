import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { Board, Note, NoteVote, Stroke } from "@/types/board";
import { BoardSurface } from "@/components/Board/BoardSurface";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getUser();
  if (!user) {
    redirect(`/?next=${encodeURIComponent(`/b/${slug}`)}`);
  }

  const supabase = await createClient();

  const { data: board } = await supabase
    .from("boards")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Board>();

  if (!board) {
    notFound();
  }

  const [{ data: notes }, { data: strokes }, { data: votes }] = await Promise.all([
    supabase.from("notes").select("*").eq("board_id", board.id).order("z_index"),
    supabase.from("strokes").select("*").eq("board_id", board.id).order("created_at"),
    supabase.from("note_votes").select("*").eq("board_id", board.id),
  ]);

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };

  return (
    <BoardSurface
      board={board}
      userId={user.id}
      userName={meta.full_name ?? meta.name ?? null}
      userEmail={user.email ?? null}
      userAvatarUrl={meta.avatar_url ?? meta.picture ?? null}
      initialNotes={(notes ?? []) as Note[]}
      initialStrokes={(strokes ?? []) as Stroke[]}
      initialVotes={(votes ?? []) as NoteVote[]}
    />
  );
}
