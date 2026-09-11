import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Every field type the builder can place on a form. */
export const fieldType = v.union(
  // -- text-ish inputs
  v.literal("text"),
  v.literal("textarea"),
  v.literal("email"),
  v.literal("phone"),
  v.literal("url"),
  v.literal("password"),
  v.literal("number"),
  // -- date & time
  v.literal("date"),
  v.literal("time"),
  // -- choice inputs
  v.literal("select"),
  v.literal("multiselect"),
  v.literal("radio"),
  v.literal("checkboxGroup"),
  v.literal("checkbox"),
  v.literal("switch"),
  // -- specialised
  v.literal("slider"),
  v.literal("rating"),
  v.literal("otp"),
  v.literal("file"),
  v.literal("hidden"),
  // -- static / layout only
  v.literal("heading"),
  v.literal("paragraph"),
  v.literal("divider"),
);

export const fieldOption = v.object({
  label: v.string(),
  value: v.string(),
});

export const fieldValidation = v.object({
  min: v.optional(v.number()),
  max: v.optional(v.number()),
  step: v.optional(v.number()),
  minLength: v.optional(v.number()),
  maxLength: v.optional(v.number()),
  pattern: v.optional(v.string()),
  patternMessage: v.optional(v.string()),
  maxFileSizeMb: v.optional(v.number()),
  acceptedFileTypes: v.optional(v.string()),
});

/**
 * One visibility rule. Attached to a step or a field, it makes that part of the
 * form appear only when another field's answer matches — the mechanism behind
 * "pick a type, then answer that type's questions".
 *
 * See `lib/conditions.ts` for how a rule is evaluated.
 */
export const visibilityCondition = v.object({
  /** `key` of the field whose answer is tested. */
  fieldKey: v.string(),
  operator: v.union(
    v.literal("anyOf"),
    v.literal("noneOf"),
    v.literal("isEmpty"),
    v.literal("isNotEmpty"),
  ),
  /** Compared against the answer; ignored by isEmpty / isNotEmpty. */
  values: v.array(v.string()),
});

/** Events a webhook can subscribe to. */
export const webhookEvent = v.union(
  v.literal("form.created"),
  v.literal("form.updated"),
  v.literal("form.published"),
  v.literal("form.unpublished"),
  v.literal("form.deleted"),
  v.literal("form.viewed"),
  v.literal("form.step_completed"),
  v.literal("submission.created"),
  v.literal("submission.updated"),
  v.literal("submission.deleted"),
);

export const memberRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("viewer"),
);

export default defineSchema({
  /** Platform accounts. `role: "admin"` is a Magic Forms staff account. */
  users: defineTable({
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    company: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    disabled: v.optional(v.boolean()),
  }).index("by_email", ["email"]),

  /** Bearer sessions minted at sign-in. The token itself is stored hashed. */
  sessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    userAgent: v.optional(v.string()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_user", ["userId"]),

  /** A company. Everything else hangs off a workspace. */
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    ownerId: v.id("users"),
    /** Shown on the public workspace directory page. */
    publicDirectory: v.boolean(),
    archived: v.optional(v.boolean()),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: memberRole,
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_and_user", ["workspaceId", "userId"]),

  forms: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.optional(v.string()),
    slug: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("closed"),
    ),
    /** Denormalised counters — Convex has no count operator. */
    submissionCount: v.number(),
    viewCount: v.number(),
    settings: v.object({
      submitLabel: v.string(),
      successTitle: v.string(),
      successMessage: v.string(),
      redirectUrl: v.optional(v.string()),
      showProgressBar: v.boolean(),
      allowMultipleSubmissions: v.boolean(),
      closedMessage: v.optional(v.string()),
      accentColor: v.optional(v.string()),
    }),
    createdBy: v.id("users"),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_slug", ["workspaceId", "slug"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  /** A form is always at least one step; multi-step forms have many. */
  steps: defineTable({
    formId: v.id("forms"),
    order: v.number(),
    title: v.string(),
    description: v.optional(v.string()),
    /** Absent means the step is always shown. */
    condition: v.optional(visibilityCondition),
  }).index("by_form_and_order", ["formId", "order"]),

  fields: defineTable({
    formId: v.id("forms"),
    stepId: v.id("steps"),
    order: v.number(),
    type: fieldType,
    /** Stable key used for the submission payload and the public API. */
    key: v.string(),
    label: v.string(),
    placeholder: v.optional(v.string()),
    helpText: v.optional(v.string()),
    defaultValue: v.optional(v.string()),
    required: v.boolean(),
    width: v.union(v.literal("full"), v.literal("half"), v.literal("third")),
    options: v.array(fieldOption),
    validation: fieldValidation,
    /** Absent means the field is always shown, as long as its step is. */
    condition: v.optional(visibilityCondition),
  })
    .index("by_form", ["formId"])
    .index("by_step_and_order", ["stepId", "order"]),

  submissions: defineTable({
    formId: v.id("forms"),
    workspaceId: v.id("workspaces"),
    /** field key -> stringified value (arrays are JSON encoded). */
    data: v.record(v.string(), v.string()),
    /** Files uploaded with the submission, keyed by field. */
    files: v.array(
      v.object({
        key: v.string(),
        storageId: v.id("_storage"),
        name: v.string(),
        size: v.number(),
      }),
    ),
    source: v.union(v.literal("web"), v.literal("api")),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    read: v.boolean(),
  })
    .index("by_form", ["formId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_form_and_read", ["formId", "read"]),

  /** A webhook scoped to a whole workspace, or to one form when formId is set. */
  webhooks: defineTable({
    workspaceId: v.id("workspaces"),
    formId: v.optional(v.id("forms")),
    name: v.string(),
    url: v.string(),
    events: v.array(webhookEvent),
    secret: v.string(),
    enabled: v.boolean(),
    /** Extra headers sent with every delivery. */
    headers: v.array(v.object({ key: v.string(), value: v.string() })),
    successCount: v.number(),
    failureCount: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_form", ["formId"]),

  webhookDeliveries: defineTable({
    webhookId: v.id("webhooks"),
    workspaceId: v.id("workspaces"),
    event: webhookEvent,
    url: v.string(),
    requestBody: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("success"),
      v.literal("failed"),
    ),
    statusCode: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    attempt: v.number(),
  })
    .index("by_webhook", ["webhookId"])
    .index("by_workspace", ["workspaceId"]),

  /**
   * Tokens for the hosted MCP endpoint. A token acts as the account that
   * created it and carries exactly that account's access — `workspaceId`
   * records where it was created so it can be listed there, and does not
   * narrow what the token can reach.
   */
  mcpTokens: defineTable({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    name: v.string(),
    /** First 12 chars, so a token can be recognised in the list. */
    prefix: v.string(),
    tokenHash: v.string(),
    lastUsedAt: v.optional(v.number()),
    revoked: v.boolean(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"]),

  /** Keys for the read side of the public HTTP API. */
  apiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    /** First 12 chars, shown in the UI so a key can be recognised. */
    prefix: v.string(),
    keyHash: v.string(),
    createdBy: v.id("users"),
    lastUsedAt: v.optional(v.number()),
    revoked: v.boolean(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_keyHash", ["keyHash"]),
});
