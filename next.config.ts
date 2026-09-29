import type { NextConfig } from "next";

// The REST API is served by Convex HTTP actions (convex/http.ts), which live
// on the deployment's .convex.site domain. Proxying /api/v1 through the app
// gives integrations one stable address — https://forms.magicwebs.ai/api/v1/…
// — that survives a move to another deployment. Authorization and every other
// header pass through the proxy untouched.
const convexSite = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return convexSite
      ? [{ source: "/api/v1/:path*", destination: `${convexSite}/api/v1/:path*` }]
      : [];
  },
};

export default nextConfig;
