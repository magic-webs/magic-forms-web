import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const BATCH = 200;

/**
 * Deletes a form's steps, fields and submissions in batches, rescheduling
 * itself until nothing is left, so a form with a lot of history never exceeds
 * a single mutation's transaction limits.
 */
export const purgeForm = internalMutation({
  args: { formId: v.id("forms") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .take(BATCH);
    for (const field of fields) await ctx.db.delete("fields", field._id);

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .take(BATCH);
    for (const submission of submissions) {
      for (const file of submission.files) {
        await ctx.storage.delete(file.storageId);
      }
      await ctx.db.delete("submissions", submission._id);
    }

    if (fields.length === BATCH || submissions.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.cleanup.purgeForm, args);
      return null;
    }

    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", args.formId))
      .take(BATCH);
    for (const step of steps) await ctx.db.delete("steps", step._id);

    const hooks = await ctx.db
      .query("webhooks")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .take(BATCH);
    for (const hook of hooks) await ctx.db.delete("webhooks", hook._id);

    return null;
  },
});

/** Same idea, one level up: drains a whole workspace. */
export const purgeWorkspace = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const forms = await ctx.db
      .query("forms")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(20);

    for (const form of forms) {
      await ctx.db.delete("forms", form._id);
      await ctx.scheduler.runAfter(0, internal.cleanup.purgeForm, {
        formId: form._id,
      });
    }
    if (forms.length === 20) {
      await ctx.scheduler.runAfter(0, internal.cleanup.purgeWorkspace, args);
      return null;
    }

    for (const table of ["members", "webhooks", "apiKeys"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .take(BATCH);
      for (const row of rows) await ctx.db.delete(table, row._id);
    }

    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(BATCH);
    for (const row of deliveries) {
      await ctx.db.delete("webhookDeliveries", row._id);
    }

    if (deliveries.length < BATCH) {
      await ctx.db.delete("workspaces", args.workspaceId);
    } else {
      await ctx.scheduler.runAfter(0, internal.cleanup.purgeWorkspace, args);
    }
    return null;
  },
});

/** Housekeeping: drop expired sessions and old webhook delivery logs. */
export const pruneExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db.query("sessions").take(500);
    for (const session of sessions) {
      if (session.expiresAt < now) await ctx.db.delete("sessions", session._id);
    }

    const cutoff = now - 1000 * 60 * 60 * 24 * 14;
    const deliveries = await ctx.db.query("webhookDeliveries").take(500);
    for (const delivery of deliveries) {
      if (delivery._creationTime < cutoff) {
        await ctx.db.delete("webhookDeliveries", delivery._id);
      }
    }
    return null;
  },
});
