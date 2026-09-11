/**
 * Magic Forms is its own identity provider: it signs RS256 access tokens and
 * publishes the matching JWKS from `convex/http.ts`, so `ctx.auth.getUserIdentity()`
 * works natively without a third-party auth service.
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "magic-forms",
    },
  ],
};
