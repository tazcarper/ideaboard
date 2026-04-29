import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(oauthError)}`, url.origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
