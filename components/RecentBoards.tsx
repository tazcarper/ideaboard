"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "ideaboard:recent";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string {
  return localStorage.getItem(KEY) ?? "";
}

function getServerSnapshot(): string {
  return "";
}

export function RecentBoards() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  let slugs: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) slugs = parsed.filter((s) => typeof s === "string");
    } catch {}
  }

  if (slugs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-zinc-500">Recent boards</h2>
      <ul className="flex flex-col gap-1">
        {slugs.map((slug) => (
          <li key={slug}>
            <Link href={`/b/${slug}`} className="text-blue-600 hover:underline">
              /b/{slug}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
