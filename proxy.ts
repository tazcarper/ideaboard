import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// In Next.js 16 the `middleware` file convention was renamed to `proxy`.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
//
// This proxy refreshes the Supabase auth session cookie on every (matched)
// request and revalidates the JWT via `getUser()`. We MUST call `getUser()`,
// not `getSession()` — the latter only reads the cookie without verifying it
// against Supabase's auth server, so a tampered cookie would slip through.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Push refreshed cookies onto BOTH the incoming request (so RSC sees
          // them this render) and the outgoing response (so the browser stores
          // them for next time). This is the standard @supabase/ssr pattern.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Revalidate JWT. Don't remove this — `getSession()` would NOT verify.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on every page route. Skip static assets, image optimization, and the
  // OAuth callback (which manages cookies itself via exchangeCodeForSession).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
