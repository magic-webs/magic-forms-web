/**
 * Convex function references.
 *
 * `convex/_generated/api.js` is exactly this line, but importing it from
 * outside a bundler makes Node reparse it as a typeless module and warn on
 * stderr — which an MCP client reads. `anyApi` resolves `api.forms.create` to
 * the same reference by path.
 *
 * This lives apart from `convex.mjs` so the tool modules can be imported by the
 * hosted endpoint without pulling in the stdio server's filesystem handling.
 */
import { anyApi } from "convex/server";

export const api = anyApi;
