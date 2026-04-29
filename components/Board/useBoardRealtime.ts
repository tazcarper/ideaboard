"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useBoardStore } from "./useBoardStore";
import type { Note, Point, Stroke } from "@/types/board";

const supabase = createClient();

export type RemoteCursor = {
  user_id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  ts: number;
};

type Identity = { clientId: string; name: string; color: string };

const CURSOR_THROTTLE_MS = 33;
const CURSOR_STALE_MS = 5000;
const STROKE_THROTTLE_MS = 33;

export function useBoardRealtime(boardId: string, identity: Identity | null) {
  const upsertNote = useBoardStore((s) => s.upsertNote);
  const removeNote = useBoardStore((s) => s.removeNote);
  const upsertStroke = useBoardStore((s) => s.upsertStroke);
  const removeStroke = useBoardStore((s) => s.removeStroke);
  const upsertRemotePendingStroke = useBoardStore((s) => s.upsertRemotePendingStroke);
  const removeRemotePendingStroke = useBoardStore((s) => s.removeRemotePendingStroke);

  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastCursorSendRef = useRef(0);
  const lastStrokeSendRef = useRef(0);

  useEffect(() => {
    if (!boardId || !identity) return;

    const channel = supabase.channel(`board:${boardId}`, {
      config: { broadcast: { self: false }, presence: { key: identity.clientId } },
    });

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notes", filter: `board_id=eq.${boardId}` },
      (payload) => {
        const n = payload.new as Note;
        if (n.updated_by === identity.clientId) return;
        upsertNote(n);
      }
    );

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "notes", filter: `board_id=eq.${boardId}` },
      (payload) => {
        const n = payload.new as Note;
        if (n.updated_by === identity.clientId) return;
        upsertNote(n);
      }
    );

    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "notes", filter: `board_id=eq.${boardId}` },
      (payload) => {
        const n = payload.old as Pick<Note, "id">;
        if (n?.id) removeNote(n.id);
      }
    );

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "strokes", filter: `board_id=eq.${boardId}` },
      (payload) => {
        const s = payload.new as Stroke;
        if (s.created_by === identity.clientId) return;
        upsertStroke(s);
        removeRemotePendingStroke(s.id);
      }
    );

    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "strokes", filter: `board_id=eq.${boardId}` },
      (payload) => {
        const s = payload.old as Pick<Stroke, "id">;
        if (s?.id) {
          removeStroke(s.id);
          removeRemotePendingStroke(s.id);
        }
      }
    );

    channel.on("broadcast", { event: "cursor" }, (msg) => {
      const c = msg.payload as RemoteCursor;
      if (!c || c.user_id === identity.clientId) return;
      setRemoteCursors((prev) => ({ ...prev, [c.user_id]: { ...c, ts: Date.now() } }));
    });

    channel.on("broadcast", { event: "stroke:point" }, (msg) => {
      const s = msg.payload as Stroke & { user_id: string };
      if (!s || s.user_id === identity.clientId) return;
      upsertRemotePendingStroke(s);
    });

    channel.on("broadcast", { event: "stroke:end" }, (msg) => {
      const p = msg.payload as { id: string; user_id: string };
      if (!p || p.user_id === identity.clientId) return;
      removeRemotePendingStroke(p.id);
    });

    channel.on("presence", { event: "leave" }, (msg) => {
      const left = msg.leftPresences as Array<{ user_id?: string }>;
      setRemoteCursors((prev) => {
        const next = { ...prev };
        for (const p of left) {
          if (p?.user_id) delete next[p.user_id];
        }
        return next;
      });
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: identity.clientId,
          name: identity.name,
          color: identity.color,
        });
      }
    });

    channelRef.current = channel;

    const interval = window.setInterval(() => {
      const cutoff = Date.now() - CURSOR_STALE_MS;
      setRemoteCursors((prev) => {
        let changed = false;
        const next: Record<string, RemoteCursor> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.ts >= cutoff) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [
    boardId,
    identity,
    upsertNote,
    removeNote,
    upsertStroke,
    removeStroke,
    upsertRemotePendingStroke,
    removeRemotePendingStroke,
  ]);

  const broadcastCursor = useCallback(
    (point: Point) => {
      const ch = channelRef.current;
      if (!ch || !identity) return;
      const now = Date.now();
      if (now - lastCursorSendRef.current < CURSOR_THROTTLE_MS) return;
      lastCursorSendRef.current = now;
      void ch.send({
        type: "broadcast",
        event: "cursor",
        payload: {
          user_id: identity.clientId,
          name: identity.name,
          color: identity.color,
          x: point[0],
          y: point[1],
          ts: now,
        } satisfies RemoteCursor,
      });
    },
    [identity]
  );

  const broadcastStrokePoint = useCallback(
    (stroke: Stroke) => {
      const ch = channelRef.current;
      if (!ch || !identity) return;
      const now = Date.now();
      if (now - lastStrokeSendRef.current < STROKE_THROTTLE_MS) return;
      lastStrokeSendRef.current = now;
      void ch.send({
        type: "broadcast",
        event: "stroke:point",
        payload: { ...stroke, user_id: identity.clientId },
      });
    },
    [identity]
  );

  const broadcastStrokeEnd = useCallback(
    (strokeId: string) => {
      const ch = channelRef.current;
      if (!ch || !identity) return;
      void ch.send({
        type: "broadcast",
        event: "stroke:end",
        payload: { id: strokeId, user_id: identity.clientId },
      });
    },
    [identity]
  );

  return { remoteCursors, broadcastCursor, broadcastStrokePoint, broadcastStrokeEnd };
}
