"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateBoardButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.slug) {
        throw new Error(data.error ?? "Failed to create board");
      }

      try {
        const recentRaw = localStorage.getItem("ideaboard:recent");
        const recent: string[] = recentRaw ? JSON.parse(recentRaw) : [];
        const next = [data.slug, ...recent.filter((s) => s !== data.slug)].slice(0, 8);
        localStorage.setItem("ideaboard:recent", JSON.stringify(next));
      } catch {}

      router.push(`/b/${data.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
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
        {loading ? "Creating..." : "Create a board"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
