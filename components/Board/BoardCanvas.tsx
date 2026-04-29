"use client";

import { useEffect, useRef } from "react";
import { useBoardStore } from "./useBoardStore";
import { STROKE_HEX } from "@/lib/colors";
import type { Stroke } from "@/types/board";

type Props = {
  width: number;
  height: number;
};

export function BoardCanvas({ width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useBoardStore((s) => s.strokes);
  const pendingStroke = useBoardStore((s) => s.pendingStroke);
  const remotePendingStrokes = useBoardStore((s) => s.remotePendingStrokes);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const all: Stroke[] = Object.values(strokes);
    if (pendingStroke) all.push(pendingStroke);
    for (const rs of Object.values(remotePendingStrokes)) all.push(rs);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const s of all) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = STROKE_HEX[s.color] ?? "#111";
      ctx.lineWidth = s.width;
      ctx.beginPath();
      const [x0, y0] = s.points[0];
      ctx.moveTo(x0, y0);
      for (let i = 1; i < s.points.length; i++) {
        const [x, y] = s.points[i];
        ctx.lineTo(x, y);
      }
      if (s.points.length === 1) {
        ctx.lineTo(x0 + 0.01, y0 + 0.01);
      }
      ctx.stroke();
    }
  }, [strokes, pendingStroke, remotePendingStrokes, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
