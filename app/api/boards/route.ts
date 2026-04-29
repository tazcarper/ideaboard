import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newSlug } from "@/lib/slug";

const RATE_LIMIT_PER_HOUR = 30;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countError } = await supabase
    .from("boards")
    .select("*", { count: "exact", head: true })
    .eq("created_by", user.id)
    .gte("created_at", oneHourAgo);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.slice(0, 80) : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = newSlug();
    const { data, error } = await supabase
      .from("boards")
      .insert({ slug, name, created_by: user.id })
      .select("slug")
      .single();

    if (!error && data) {
      return NextResponse.json({ slug: data.slug });
    }

    if (error?.code !== "23505") {
      return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "could not generate unique slug" }, { status: 500 });
}
