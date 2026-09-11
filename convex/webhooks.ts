import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireWorkspaceAccess } from "./lib/authz";
import { hmacSha256, randomToken } from "./lib/crypto";
import { ALL_EVENTS } from "./lib/events";
import { webhookEvent } from "./schema";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [15_000, 60_000];

export const availableEvents = query({
  args: {},
  returns: v.array(v.string()),
  handler: async () => ALL_EVENTS,
});

export const listByWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const hooks = await ctx.db
      .query("webhooks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(100);

    return await Promise.all(
      hooks.map(async (hook) => {
        const form = hook.formId
          ? await ctx.db.get("forms", hook.formId)
          : null;
        return {
          _id: hook._id,
          name: hook.name,
          url: hook.url,
          events: hook.events,
          enabled: hook.enabled,
          secret: hook.secret,
          headers: hook.headers,
          successCount: hook.successCount,
          failureCount: hook.failureCount,
          formId: hook.formId ?? null,
          formTitle: form?.title ?? null,
          createdAt: hook._creationTime,
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    url: v.string(),
    events: v.array(webhookEvent),
    formId: v.optional(v.id("forms")),
    headers: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
  },
  returns: v.id("webhooks"),
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, "admin");
    assertHttpsUrl(args.url);
    if (args.events.length === 0) {
      throw new Error("Pick at least one event to listen for.");
    }
    if (args.formId) {
      const form = await ctx.db.get("forms", args.formId);
      if (!form || form.workspaceId !== args.workspaceId) {
        throw new Error("That form is not in this workspace.");
      }
    }

    return await ctx.db.insert("webhooks", {
      workspaceId: args.workspaceId,
      formId: args.formId,
      name: args.name.trim() || "Webhook",
      url: args.url.trim(),
      events: args.events,
      secret: "whsec_" + randomToken(24),
      enabled: true,
      headers: args.headers ?? [],
      successCount: 0,
      failureCount: 0,
    });
  },
});

export const update = mutation({
  args: {
    webhookId: v.id("webhooks"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    events: v.optional(v.array(webhookEvent)),
    enabled: v.optional(v.boolean()),
    formId: v.optional(v.union(v.id("forms"), v.null())),
    headers: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() })),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get("webhooks", args.webhookId);
    if (!hook) throw new Error("Webhook not found.");
    await requireWorkspaceAccess(ctx, hook.workspaceId, "admin");

    const patch: Partial<Doc<"webhooks">> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || hook.name;
    if (args.url !== undefined) {
      assertHttpsUrl(args.url);
      patch.url = args.url.trim();
    }
    if (args.events !== undefined) {
      if (args.events.length === 0) {
        throw new Error("Pick at least one event to listen for.");
      }
      patch.events = args.events;
    }
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.headers !== undefined) patch.headers = args.headers;
    if (args.formId !== undefined) {
      patch.formId = args.formId === null ? undefined : args.formId;
    }

    await ctx.db.patch("webhooks", args.webhookId, patch);
    return null;
  },
});

export const rotateSecret = mutation({
  args: { webhookId: v.id("webhooks") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get("webhooks", args.webhookId);
    if (!hook) throw new Error("Webhook not found.");
    await requireWorkspaceAccess(ctx, hook.workspaceId, "admin");
    const secret = "whsec_" + randomToken(24);
    await ctx.db.patch("webhooks", args.webhookId, { secret });
    return secret;
  },
});

export const remove = mutation({
  args: { webhookId: v.id("webhooks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get("webhooks", args.webhookId);
    if (!hook) return null;
    await requireWorkspaceAccess(ctx, hook.workspaceId, "admin");
    await ctx.db.delete("webhooks", args.webhookId);

    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_webhook", (q) => q.eq("webhookId", args.webhookId))
      .take(200);
    for (const delivery of deliveries) {
      await ctx.db.delete("webhookDeliveries", delivery._id);
    }
    return null;
  },
});

/** Sends a sample payload so an endpoint can be verified from the UI. */
export const sendTest = mutation({
  args: { webhookId: v.id("webhooks") },
  returns: v.id("webhookDeliveries"),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get("webhooks", args.webhookId);
    if (!hook) throw new Error("Webhook not found.");
    await requireWorkspaceAccess(ctx, hook.workspaceId, "admin");

    const body = JSON.stringify({
      event: "submission.created",
      createdAt: new Date().toISOString(),
      workspaceId: hook.workspaceId,
      formId: hook.formId ?? null,
      test: true,
      data: {
        submissionId: "test_submission",
        formTitle: "Test delivery from Magic Forms",
        data: { full_name: "Ada Lovelace", email: "ada@example.com" },
      },
    });

    const deliveryId = await ctx.db.insert("webhookDeliveries", {
      webhookId: hook._id,
      workspaceId: hook.workspaceId,
      event: "submission.created",
      url: hook.url,
      requestBody: body,
      status: "pending",
      attempt: 1,
    });
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, {
      deliveryId,
      webhookId: hook._id,
    });
    return deliveryId;
  },
});

export const listDeliveries = query({
  args: { workspaceId: v.id("workspaces"), webhookId: v.optional(v.id("webhooks")) },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const rows = args.webhookId
      ? await ctx.db
          .query("webhookDeliveries")
          .withIndex("by_webhook", (q) => q.eq("webhookId", args.webhookId!))
          .order("desc")
          .take(50)
      : await ctx.db
          .query("webhookDeliveries")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", args.workspaceId),
          )
          .order("desc")
          .take(50);

    return await Promise.all(
      rows.map(async (row) => {
        const hook = await ctx.db.get("webhooks", row.webhookId);
        return {
          _id: row._id,
          event: row.event,
          url: row.url,
          status: row.status,
          statusCode: row.statusCode ?? null,
          error: row.error ?? null,
          responseBody: row.responseBody ?? null,
          requestBody: row.requestBody,
          durationMs: row.durationMs ?? null,
          attempt: row.attempt,
          createdAt: row._creationTime,
          webhookName: hook?.name ?? "Deleted webhook",
        };
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export const loadDelivery = internalQuery({
  args: { deliveryId: v.id("webhookDeliveries"), webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    const hook = await ctx.db.get("webhooks", args.webhookId);
    if (!delivery || !hook) return null;
    return { delivery, hook };
  },
});

export const recordResult = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    webhookId: v.id("webhooks"),
    status: v.union(v.literal("success"), v.literal("failed")),
    statusCode: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    error: v.optional(v.string()),
    durationMs: v.number(),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("webhookDeliveries", args.deliveryId, {
      status: args.status,
      statusCode: args.statusCode,
      responseBody: args.responseBody,
      error: args.error,
      durationMs: args.durationMs,
      attempt: args.attempt,
    });

    const hook = await ctx.db.get("webhooks", args.webhookId);
    if (hook) {
      await ctx.db.patch("webhooks", args.webhookId, {
        successCount: hook.successCount + (args.status === "success" ? 1 : 0),
        failureCount: hook.failureCount + (args.status === "failed" ? 1 : 0),
      });
    }
    return null;
  },
});

/**
 * POSTs one delivery and retries with a backoff on network errors or 5xx.
 *
 * Each attempt is signed `sha256=<hmac>` over `<timestamp>.<body>`, so a
 * receiver can verify the payload came from this workspace's webhook secret.
 */
export const deliver = internalAction({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    webhookId: v.id("webhooks"),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 1;
    const loaded = await ctx.runQuery(internal.webhooks.loadDelivery, {
      deliveryId: args.deliveryId,
      webhookId: args.webhookId,
    });
    if (!loaded) return null;
    const { delivery, hook } = loaded;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await hmacSha256(
      hook.secret,
      timestamp + "." + delivery.requestBody,
    );

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "MagicForms-Webhooks/1.0",
      "x-magicforms-event": delivery.event,
      "x-magicforms-delivery": args.deliveryId,
      "x-magicforms-timestamp": timestamp,
      "x-magicforms-signature": "sha256=" + signature,
    };
    for (const header of hook.headers) {
      if (header.key.trim()) headers[header.key.trim()] = header.value;
    }

    const startedAt = Date.now();
    let statusCode: number | undefined;
    let responseBody: string | undefined;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(hook.url, {
        method: "POST",
        headers,
        body: delivery.requestBody,
        signal: controller.signal,
      });
      clearTimeout(timer);
      statusCode = response.status;
      responseBody = (await response.text()).slice(0, 2000);
      if (!response.ok) error = "Endpoint returned " + response.status;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    const retryable =
      error !== undefined && (statusCode === undefined || statusCode >= 500);

    if (retryable && attempt < MAX_ATTEMPTS) {
      await ctx.runMutation(internal.webhooks.recordResult, {
        deliveryId: args.deliveryId,
        webhookId: args.webhookId,
        status: "failed",
        statusCode,
        responseBody,
        error: error + " — retrying",
        durationMs: Date.now() - startedAt,
        attempt,
      });
      await ctx.scheduler.runAfter(
        RETRY_DELAYS_MS[attempt - 1] ?? 60_000,
        internal.webhooks.deliver,
        { ...args, attempt: attempt + 1 },
      );
      return null;
    }

    await ctx.runMutation(internal.webhooks.recordResult, {
      deliveryId: args.deliveryId,
      webhookId: args.webhookId,
      status: error === undefined ? "success" : "failed",
      statusCode,
      responseBody,
      error,
      durationMs: Date.now() - startedAt,
      attempt,
    });
    return null;
  },
});

function assertHttpsUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Enter a valid absolute URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Webhook URLs must use http:// or https://");
  }
}
