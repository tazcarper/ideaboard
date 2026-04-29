"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  next?: string;
  label?: string;
};

export function SignInButton({ next = "/", label = "Sign in with Google" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-full bg-black px-6 py-3 text-white font-medium hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Redirecting…" : label}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
