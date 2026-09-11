import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  hashPassword,
  randomToken,
  safeEqual,
  sha256,
  signAccessToken,
} from "./lib/crypto";
import { getCurrentUser, requireUser, slugify } from "./lib/authz";
import { userError } from "./lib/errors";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const ACCESS_TOKEN_TTL_SECONDS = 60 * 30; // 30 minutes

const publicUser = v.object({
  _id: v.id("users"),
  email: v.string(),
  name: v.string(),
  role: v.union(v.literal("admin"), v.literal("user")),
  company: v.optional(v.string()),
});

const authResult = v.object({
  refreshToken: v.string(),
  accessToken: v.string(),
  accessTokenExpiresAt: v.number(),
  user: publicUser,
});

function toPublicUser(user: Doc<"users">) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    company: user.company,
  };
}

// ---------------------------------------------------------------------------
// Internal plumbing
// ---------------------------------------------------------------------------

export const findByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const createUserRecord = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    company: v.optional(v.string()),
    workspaceName: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) userError("An account with that email already exists.");

    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: args.role,
      company: args.company,
    });

    // Give every new company account a workspace to land in.
    if (args.workspaceName) {
      const base = slugify(args.workspaceName);
      let slug = base;
      let suffix = 1;
      while (
        await ctx.db
          .query("workspaces")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .unique()
      ) {
        suffix += 1;
        slug = base + "-" + suffix;
      }
      const workspaceId = await ctx.db.insert("workspaces", {
        name: args.workspaceName,
        slug,
        ownerId: userId,
        publicDirectory: true,
      });
      await ctx.db.insert("members", { workspaceId, userId, role: "owner" });
    }

    return userId;
  },
});

export const createSession = internalMutation({
  args: {
    userId: v.id("users"),
    tokenHash: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("sessions", {
      userId: args.userId,
      tokenHash: args.tokenHash,
      expiresAt: Date.now() + SESSION_TTL_MS,
      userAgent: args.userAgent,
    });
    return null;
  },
});

export const resolveSession = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    const user = await ctx.db.get("users", session.userId);
    if (!user || user.disabled) return null;
    return { user, sessionId: session._id };
  },
});

export const deleteSession = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (session) await ctx.db.delete("sessions", session._id);
    return null;
  },
});

/** Mints the RS256 token the Convex client sends on every subsequent call. */
async function mintAccessToken(userId: Id<"users">, role: string) {
  const privateKey = process.env.JWT_PRIVATE_KEY;
  const keyId = process.env.JWT_KID;
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!privateKey || !keyId || !siteUrl) {
    userError("Auth signing keys are not configured on this deployment.");
  }
  return await signAccessToken({
    privateKeyPkcs8Base64: privateKey,
    keyId,
    issuer: siteUrl,
    audience: "magic-forms",
    subject: userId,
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    claims: { role },
  });
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export const signUp = action({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
    workspaceName: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: authResult,
  handler: async (ctx, args): Promise<typeof authResult.type> => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      userError("Enter a valid email address.");
    }
    if (args.password.length < 8) {
      userError("Passwords must be at least 8 characters.");
    }

    const name = args.name.trim() || email.split("@")[0];
    const { hash, salt } = await hashPassword(args.password);
    const userId: Id<"users"> = await ctx.runMutation(
      internal.auth.createUserRecord,
      {
        email,
        name,
        passwordHash: hash,
        passwordSalt: salt,
        role: "user",
        company: args.workspaceName,
        workspaceName: args.workspaceName?.trim() || name + " workspace",
      },
    );

    const refreshToken = randomToken();
    await ctx.runMutation(internal.auth.createSession, {
      userId,
      tokenHash: await sha256(refreshToken),
      userAgent: args.userAgent,
    });
    const access = await mintAccessToken(userId, "user");

    return {
      refreshToken,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      user: {
        _id: userId,
        email,
        name,
        role: "user" as const,
        company: args.workspaceName,
      },
    };
  },
});

export const signIn = action({
  args: {
    email: v.string(),
    password: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: authResult,
  handler: async (ctx, args): Promise<typeof authResult.type> => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.runQuery(internal.auth.findByEmail, { email });
    // Always hash, so a missing account and a wrong password cost the same.
    const { hash } = await hashPassword(
      args.password,
      user?.passwordSalt ?? "no-such-user",
    );
    if (!user || user.disabled || !safeEqual(hash, user.passwordHash)) {
      userError("Incorrect email or password.");
    }

    const refreshToken = randomToken();
    await ctx.runMutation(internal.auth.createSession, {
      userId: user._id,
      tokenHash: await sha256(refreshToken),
      userAgent: args.userAgent,
    });
    const access = await mintAccessToken(user._id, user.role);

    return {
      refreshToken,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      user: toPublicUser(user),
    };
  },
});

/** Exchanges the long-lived refresh token for a fresh access token. */
export const refresh = action({
  args: { refreshToken: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      accessToken: v.string(),
      accessTokenExpiresAt: v.number(),
      user: publicUser,
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{
    accessToken: string;
    accessTokenExpiresAt: number;
    user: typeof publicUser.type;
  } | null> => {
    const resolved: { user: Doc<"users">; sessionId: Id<"sessions"> } | null =
      await ctx.runQuery(internal.auth.resolveSession, {
      tokenHash: await sha256(args.refreshToken),
    });
    if (!resolved) return null;
    const access = await mintAccessToken(resolved.user._id, resolved.user.role);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      user: toPublicUser(resolved.user),
    };
  },
});

export const signOut = action({
  args: { refreshToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.auth.deleteSession, {
      tokenHash: await sha256(args.refreshToken),
    });
    return null;
  },
});

export const me = query({
  args: {},
  returns: v.union(v.null(), publicUser),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return user ? toPublicUser(user) : null;
  },
});

export const updateProfile = mutation({
  args: { name: v.string(), company: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch("users", user._id, {
      name: args.name.trim() || user.name,
      company: args.company,
    });
    return null;
  },
});

/** Creates the platform administrator. Invoke from the CLI, never from a client. */
export const createAdmin = internalAction({
  args: { email: v.string(), name: v.string(), password: v.string() },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    const { hash, salt } = await hashPassword(args.password);
    return await ctx.runMutation(internal.auth.createUserRecord, {
      email: args.email.trim().toLowerCase(),
      name: args.name,
      passwordHash: hash,
      passwordSalt: salt,
      role: "admin",
    });
  },
});
