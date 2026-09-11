/**
 * Workspace and membership tools — the company side of the server.
 *
 * Every one of these is bounded by the caller's role in the workspace it names:
 * `viewer` can read, `editor` can build, `admin` can manage members, and only
 * the `owner` can delete. The checks live in Convex, not here.
 */
import { api } from "../api.mjs";
import { MEMBER_ROLES, boolean, noArgs, object, oneOf, string } from "../schema.mjs";

export const workspaceTools = [
  {
    name: "whoami",
    scope: "company",
    description:
      "The Magic Forms account this server acts as, its platform role, and the " +
      "workspaces it can reach. Call this first to find out what you can do.",
    input: noArgs,
    run: async (session) => {
      const user = await session.authenticate();
      const workspaces = await session.query(api.workspaces.list, {});
      return {
        account: user,
        platformAdmin: session.isPlatformAdmin(),
        workspaces: workspaces.map((w) => ({
          workspaceId: w._id,
          name: w.name,
          slug: w.slug,
          yourRole: w.role,
        })),
      };
    },
  },

  {
    name: "list_workspaces",
    scope: "company",
    description:
      "Every workspace this account can open, with the role it holds in each.",
    input: noArgs,
    run: (session) => session.query(api.workspaces.list, {}),
  },

  {
    name: "create_workspace",
    scope: "company",
    description:
      "Creates a workspace owned by this account. The slug is derived from the " +
      "name and is what the public form URLs use.",
    input: object(
      {
        name: string("Company or team name, 2 characters or more."),
        description: string("Shown on the public workspace directory page."),
      },
      ["name"],
    ),
    run: (session, args) =>
      session.mutation(api.workspaces.create, {
        name: args.name,
        description: args.description,
      }),
  },

  {
    name: "get_workspace",
    scope: "company",
    description:
      "One workspace with its headline numbers: forms, submissions, views, " +
      "conversion rate and the most recent responses.",
    input: object({ workspaceId: string("Workspace id.") }, ["workspaceId"]),
    run: async (session, args) => {
      const [workspace, stats] = await Promise.all([
        session.query(api.workspaces.get, { workspaceId: args.workspaceId }),
        session.query(api.workspaces.stats, { workspaceId: args.workspaceId }),
      ]);
      return { workspace, stats };
    },
  },

  {
    name: "update_workspace",
    scope: "company",
    description:
      "Renames a workspace, changes its description, or takes it in or out of " +
      "the public directory. Renaming also changes the slug, which breaks any " +
      "public form link already shared. Needs the workspace admin role.",
    input: object(
      {
        workspaceId: string("Workspace id."),
        name: string("New name — changes the slug and every public form URL."),
        description: string("New description."),
        publicDirectory: boolean(
          "Whether published forms are listed at /w/{slug}.",
        ),
      },
      ["workspaceId"],
    ),
    run: async (session, args) => {
      await session.mutation(api.workspaces.update, args);
      return { ok: true };
    },
  },

  {
    name: "archive_workspace",
    scope: "company",
    description:
      "Deletes a workspace and everything in it — forms, responses, webhooks " +
      "and API keys — permanently. Owner only. Ask the person you are working " +
      "for before calling this.",
    input: object({ workspaceId: string("Workspace id.") }, ["workspaceId"]),
    run: async (session, args) => {
      await session.mutation(api.workspaces.remove, {
        workspaceId: args.workspaceId,
      });
      return { ok: true, note: "Workspace archived; contents are being purged." };
    },
  },

  // --- members ---------------------------------------------------------------

  {
    name: "list_members",
    scope: "company",
    description: "Who belongs to a workspace and what role each one holds.",
    input: object({ workspaceId: string("Workspace id.") }, ["workspaceId"]),
    run: (session, args) =>
      session.query(api.workspaces.listMembers, {
        workspaceId: args.workspaceId,
      }),
  },

  {
    name: "add_member",
    scope: "company",
    description:
      "Adds an existing Magic Forms account to a workspace. The person must " +
      "have signed up already — this does not create an account or send an " +
      "invitation. Needs the workspace admin role.",
    input: object(
      {
        workspaceId: string("Workspace id."),
        email: string("Email of an existing Magic Forms account."),
        role: oneOf(
          MEMBER_ROLES,
          "viewer reads, editor builds forms, admin manages members and " +
            "integrations, owner can delete the workspace.",
        ),
      },
      ["workspaceId", "email", "role"],
    ),
    run: async (session, args) => {
      await session.mutation(api.workspaces.addMember, args);
      return { ok: true };
    },
  },

  {
    name: "update_member_role",
    scope: "company",
    description:
      "Changes one member's role. The workspace owner's role cannot be changed.",
    input: object(
      {
        memberId: string("Membership id from list_members (not the user id)."),
        role: oneOf(MEMBER_ROLES, "The new role."),
      },
      ["memberId", "role"],
    ),
    run: async (session, args) => {
      await session.mutation(api.workspaces.updateMemberRole, args);
      return { ok: true };
    },
  },

  {
    name: "remove_member",
    scope: "company",
    description:
      "Removes someone from a workspace. Their account and their forms survive; " +
      "only the membership goes. The owner cannot be removed.",
    input: object({ memberId: string("Membership id from list_members.") }, [
      "memberId",
    ]),
    run: async (session, args) => {
      await session.mutation(api.workspaces.removeMember, args);
      return { ok: true };
    },
  },
];
