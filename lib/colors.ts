import type { NoteColor, StrokeColor } from "@/types/board";

export const NOTE_COLORS: NoteColor[] = ["yellow", "pink", "blue", "green", "orange", "purple"];
export const STROKE_COLORS: StrokeColor[] = ["black", "red", "blue", "green", "orange", "purple"];

// Tailwind classes: written as full literals so the JIT picks them up.
export const NOTE_BG: Record<NoteColor, string> = {
  yellow: "bg-yellow-200",
  pink: "bg-pink-200",
  blue: "bg-blue-200",
  green: "bg-green-200",
  orange: "bg-orange-200",
  purple: "bg-purple-200",
};

export const NOTE_BG_DARK: Record<NoteColor, string> = {
  yellow: "bg-yellow-300",
  pink: "bg-pink-300",
  blue: "bg-blue-300",
  green: "bg-green-300",
  orange: "bg-orange-300",
  purple: "bg-purple-300",
};

export const NOTE_SWATCH: Record<NoteColor, string> = {
  yellow: "#fde68a",
  pink: "#fbcfe8",
  blue: "#bfdbfe",
  green: "#bbf7d0",
  orange: "#fed7aa",
  purple: "#e9d5ff",
};

export const STROKE_HEX: Record<StrokeColor, string> = {
  black: "#111111",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  orange: "#ea580c",
  purple: "#9333ea",
};
