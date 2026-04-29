"use client";

import type { RemoteCursor } from "./useBoardRealtime";

type Props = {
  cursors: Record<string, RemoteCursor>;
};

export function PresenceCursors({ cursors }: Props) {
  const list = Object.values(cursors);
  return (
    <>
      {list.map((c) => (
        <div
          key={c.user_id}
          className="pointer-events-none absolute z-40 flex select-none items-start gap-1 transition-transform duration-75"
          style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M2 2 L18 9 L9 11 L7 18 Z"
              fill={c.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium text-white shadow"
            style={{ backgroundColor: c.color }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </>
  );
}
