import { ConvexError } from "convex/values";

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

/**
 * Turns whatever Convex threw into a sentence worth showing someone.
 *
 * Handlers raise `ConvexError`, whose payload arrives intact on `data`. Older
 * plain `Error`s arrive as a multi-line blob — a `[Request ID] Server Error`
 * header, then `Uncaught Error: <the real message>` — so the useful line is
 * never the first one.
 */
export function readError(caught: unknown): string {
  if (caught instanceof ConvexError) {
    const data: unknown = caught.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  if (!(caught instanceof Error)) return "Something went wrong.";

  const thrown = caught.message.match(/Uncaught (?:Convex)?Error:\s*(.+)/);
  if (thrown?.[1]) return thrown[1].trim();

  const firstLine = caught.message
    .replace(/^\[.*?\]\s*/, "")
    .split("\n")[0]
    .trim();
  // "Server Error" on its own tells nobody anything.
  if (!firstLine || /^server error$/i.test(firstLine)) {
    return "Something went wrong. Please try again.";
  }
  return firstLine;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
