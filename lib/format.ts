/** Small formatting helpers shared across the dashboard pages. */

export function formatWhen(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.round(hours / 24);
  if (days < 7) return days + "d ago";
  return new Date(timestamp).toLocaleDateString();
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Convex wraps handler errors; keep only the message the handler threw. */
export function readError(caught: unknown): string {
  if (!(caught instanceof Error)) return "Something went wrong.";
  const cleaned = caught.message
    .replace(/^\[.*?\]\s*/, "")
    .replace(/^Uncaught Error:\s*/, "")
    .split("\n")[0]
    .trim();
  return cleaned || "Something went wrong.";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
