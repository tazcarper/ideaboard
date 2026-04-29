export type Identity = { clientId: string; name: string; color: string };

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#f43f5e",
];

export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(h) % COLORS.length];
}
