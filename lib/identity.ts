"use client";

const ID_KEY = "ideaboard:clientId";
const NAME_KEY = "ideaboard:displayName";
const COLOR_KEY = "ideaboard:displayColor";

const NAMES = [
  "Aqua", "Coral", "Mint", "Lavender", "Sienna", "Olive", "Ruby", "Indigo",
  "Saffron", "Plum", "Teal", "Amber", "Crimson", "Jade", "Maroon", "Pearl",
  "Cobalt", "Apricot", "Fern", "Slate", "Magenta", "Hazel",
];

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#f43f5e",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export type Identity = { clientId: string; name: string; color: string };

let cached: Identity | null = null;

function subscribe() {
  return () => {};
}

function getSnapshot(): Identity | null {
  if (!cached) cached = getIdentity();
  return cached;
}

function getServerSnapshot(): Identity | null {
  return null;
}

export const identitySource = { subscribe, getSnapshot, getServerSnapshot };

export function getIdentity(): Identity {
  let clientId = localStorage.getItem(ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(ID_KEY, clientId);
  }
  let name = localStorage.getItem(NAME_KEY);
  if (!name) {
    name = pick(NAMES);
    localStorage.setItem(NAME_KEY, name);
  }
  let color = localStorage.getItem(COLOR_KEY);
  if (!color) {
    color = pick(COLORS);
    localStorage.setItem(COLOR_KEY, color);
  }
  return { clientId, name, color };
}
