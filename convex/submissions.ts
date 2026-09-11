import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireFormAccess, requireWorkspaceAccess } from "./lib/authz";
import { dispatchEvent } from "./lib/events";
import { MULTI_TYPES, STATIC_TYPES, parseList } from "./lib/validate";

/** Paginated responses for one form, newest first. */
export const listByForm = query({
  args: {
    formId: v.id("forms"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireFormAccess(ctx, args.formId);
    const page = await ctx.db
      .query("submissions")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...page,
      page: page.page.map((submission) => ({
        _id: submission._id,
        createdAt: submission._creationTime,
        data: submission.data,
        files: submission.files,
        source: submission.source,
        read: submission.read,
        userAgent: submission.userAgent ?? null,
        referrer: submission.referrer ?? null,
      })),
    };
  },
});

/** Column headers for the responses table, in the form's own field order. */
export const columnsForForm = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    await requireFormAccess(ctx, args.formId);
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_form_and_order", (q) => q.eq("formId", args.formId))
      .take(50);
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .take(300);
    const stepOrder = new Map(steps.map((s) => [s._id, s.order]));

    return fields
      .filter((f) => !STATIC_TYPES.has(f.type))
      .sort((a, b) => {
        const sa = stepOrder.get(a.stepId) ?? 0;
        const sb = stepOrder.get(b.stepId) ?? 0;
        return sa === sb ? a.order - b.order : sa - sb;
      })
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        isList: MULTI_TYPES.has(f.type),
      }));
  },
});

export const get = query({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get("submissions", args.submissionId);
    if (!submission) return null;
    await requireFormAccess(ctx, submission.formId);

    const files = await Promise.all(
      submission.files.map(async (file) => ({
        ...file,
        url: await ctx.storage.getUrl(file.storageId),
      })),
    );
    return { ...submission, files };
  },
});

export const markRead = mutation({
  args: { submissionId: v.id("submissions"), read: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const submission = await ctx.db.get("submissions", args.submissionId);
    if (!submission) return null;
    await requireFormAccess(ctx, submission.formId, "editor");
    await ctx.db.patch("submissions", args.submissionId, { read: args.read });
    return null;
  },
});

export const remove = mutation({
  args: { submissionId: v.id("submissions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const submission = await ctx.db.get("submissions", args.submissionId);
    if (!submission) return null;
    const { form } = await requireFormAccess(ctx, submission.formId, "editor");

    for (const file of submission.files) {
      await ctx.storage.delete(file.storageId);
    }
    await ctx.db.delete("submissions", args.submissionId);
    await ctx.db.patch("forms", form._id, {
      submissionCount: Math.max(0, form.submissionCount - 1),
    });
    await dispatchEvent(ctx, {
      workspaceId: submission.workspaceId,
      formId: submission.formId,
      event: "submission.deleted",
      payload: { submissionId: args.submissionId, formId: submission.formId },
    });
    return null;
  },
});

/**
 * Builds a CSV of every response for a form.
 *
 * Capped at 5,000 rows per export so the query stays inside Convex's read
 * limits; the UI tells the user when an export was truncated.
 */
export const exportCsv = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    await requireFormAccess(ctx, args.formId);
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .take(300);
    const columns = fields.filter((f) => !STATIC_TYPES.has(f.type));

    const submissions = await ctx.db
      .query("submissions")
      .withIndex("by_form", (q) => q.eq("formId", args.formId))
      .order("desc")
      .take(5000);

    const escape = (value: string) =>
      /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;

    const header = ["Submitted at", "Source", ...columns.map((c) => c.label)];
    const rows = submissions.map((submission) => [
      new Date(submission._creationTime).toISOString(),
      submission.source,
      ...columns.map((column) => {
        const raw = submission.data[column.key] ?? "";
        if (MULTI_TYPES.has(column.type)) return parseList(raw).join("; ");
        if (column.type === "file") {
          return submission.files
            .filter((f) => f.key === column.key)
            .map((f) => f.name)
            .join("; ");
        }
        return raw;
      }),
    ]);

    return {
      filename: "responses.csv",
      truncated: submissions.length === 5000,
      csv: [header, ...rows]
        .map((row) => row.map((cell) => escape(String(cell))).join(","))
        .join("\r\n"),
    };
  },
});

/** Recent responses across a whole workspace, for the overview page. */
export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId);
    const page = await ctx.db
      .query("submissions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(args.paginationOpts);

    const titles = new Map<string, string>();
    const enriched = await Promise.all(
      page.page.map(async (submission) => {
        if (!titles.has(submission.formId)) {
          const form = await ctx.db.get("forms", submission.formId);
          titles.set(submission.formId, form?.title ?? "Deleted form");
        }
        return {
          _id: submission._id,
          formId: submission.formId,
          formTitle: titles.get(submission.formId) ?? "",
          createdAt: submission._creationTime,
          read: submission.read,
          source: submission.source,
          preview: Object.entries(submission.data)
            .slice(0, 3)
            .map(([key, value]) => key + ": " + value)
            .join(" · "),
        };
      }),
    );
    return { ...page, page: enriched };
  },
});
