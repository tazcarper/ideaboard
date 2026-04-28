import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newSlug } from "@/lib/slug";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.slice(0, 80) : null;

  const supabase = createAdminClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = newSlug();
    const { data, error } = await supabase
      .from("boards")
      .insert({ slug, name })
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
