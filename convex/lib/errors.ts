import { ConvexError } from "convex/values";

/**
 * Raises an error whose message is meant for the person using the app.
 *
 * Convex treats a plain `Error` as an internal fault: the client sees
 * "Server Error" and the real message is buried in a stack trace, which is
 * both unhelpful and leaks file paths. A `ConvexError` is delivered intact as
 * structured data, so the UI can show exactly what went wrong.
 */
export function userError(message: string): never {
  throw new ConvexError(message);
}
