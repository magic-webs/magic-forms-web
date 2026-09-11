import { Infer } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { webhookEvent } from "../schema";

export type WebhookEvent = Infer<typeof webhookEvent>;

export const ALL_EVENTS: WebhookEvent[] = [
  "form.created",
  "form.updated",
  "form.published",
  "form.unpublished",
  "form.deleted",
  "form.viewed",
  "form.step_completed",
  "submission.created",
  "submission.updated",
  "submission.deleted",
];

/**
 * Fans an event out to every enabled webhook that subscribes to it.
 *
 * A webhook with no `formId` listens to the whole workspace; one with a
 * `formId` only fires for that form. Deliveries are scheduled, so a slow or
 * broken endpoint can never hold up the mutation that produced the event.
 */
export async function dispatchEvent(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    formId?: Id<"forms">;
    event: WebhookEvent;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const webhooks = await ctx.db
    .query("webhooks")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
    .take(100);

  const matching = webhooks.filter(
    (hook) =>
      hook.enabled &&
      hook.events.includes(args.event) &&
      (hook.formId === undefined || hook.formId === args.formId),
  );
  if (matching.length === 0) return;

  const body = JSON.stringify({
    event: args.event,
    createdAt: new Date().toISOString(),
    workspaceId: args.workspaceId,
    formId: args.formId ?? null,
    data: args.payload,
  });

  for (const hook of matching) {
    const deliveryId = await ctx.db.insert("webhookDeliveries", {
      webhookId: hook._id,
      workspaceId: args.workspaceId,
      event: args.event,
      url: hook.url,
      requestBody: body,
      status: "pending",
      attempt: 1,
    });
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, {
      deliveryId,
      webhookId: hook._id,
    });
  }
}
