/**
 * Platform administrator tools.
 *
 * These only reach the client when the server is signed in as Magic Forms
 * staff — an agent running as a company account never sees them listed. Convex
 * enforces the same rule again on every call, so hiding them is a courtesy to
 * the agent, not the security boundary.
 */
import { api } from "../api.mjs";
import { boolean, noArgs, object, oneOf, string } from "../schema.mjs";

export const adminTools = [
  {
    name: "admin_overview",
    scope: "admin",
    description:
      "Platform-wide totals: accounts, administrators, workspaces, forms, " +
      "submissions, views and webhooks.",
    input: noArgs,
    run: (session) => session.query(api.admin.overview, {}),
  },

  {
    name: "admin_list_users",
    scope: "admin",
    description:
      "Every account on the platform with its role, company, workspace count " +
      "and whether it is disabled.",
    input: noArgs,
    run: (session) => session.query(api.admin.listUsers, {}),
  },

  {
    name: "admin_list_workspaces",
    scope: "admin",
    description:
      "Every workspace on the platform with its owner, member and form counts " +
      "and submission total.",
    input: noArgs,
    run: (session) => session.query(api.admin.listWorkspaces, {}),
  },

  {
    name: "admin_create_company",
    scope: "admin",
    description:
      "Provisions a company: the account, the workspace it owns, and the owner " +
      "membership joining them. Omit the password and a temporary one is " +
      "generated and returned once — nothing stores the plaintext, so pass it " +
      "on straight away. The account can then sign in and be added to other " +
      "workspaces by email.",
    input: object(
      {
        email: string("Email for the new account. Must not already be in use."),
        name: string("The person or company name on the account."),
        workspaceName: string(
          "Name for their workspace. Defaults to the account name.",
        ),
        password: string(
          "Set a password instead of generating one. 8 characters or more.",
        ),
      },
      ["email", "name"],
    ),
    run: (session, args) => session.action(api.admin.createCompany, args),
  },

  {
    name: "admin_create_workspace_for",
    scope: "admin",
    description:
      "Creates an extra workspace owned by an account that already exists — " +
      "for a company running more than one brand or team. Use " +
      "admin_create_company when the account does not exist yet.",
    input: object(
      {
        ownerEmail: string("Email of the account that will own it."),
        name: string("Workspace name."),
        description: string("Shown on the public workspace directory page."),
      },
      ["ownerEmail", "name"],
    ),
    run: (session, args) => session.mutation(api.admin.createWorkspaceFor, args),
  },

  {
    name: "admin_set_user_role",
    scope: "admin",
    description:
      "Promotes an account to platform staff, or returns it to a normal user. " +
      "Staff can see and act on every workspace, so grant this sparingly. You " +
      "cannot remove your own.",
    input: object(
      {
        userId: string("Account id, from admin_list_users."),
        role: oneOf(
          ["admin", "user"],
          "admin is Magic Forms staff; user is a normal account.",
        ),
      },
      ["userId", "role"],
    ),
    run: async (session, args) => {
      await session.mutation(api.admin.setUserRole, args);
      return { ok: true };
    },
  },

  {
    name: "admin_set_user_disabled",
    scope: "admin",
    description:
      "Disables or re-enables an account. Disabling also ends every live " +
      "session it holds. You cannot disable your own.",
    input: object(
      {
        userId: string("Account id, from admin_list_users."),
        disabled: boolean("true to lock the account out, false to restore it."),
      },
      ["userId", "disabled"],
    ),
    run: async (session, args) => {
      await session.mutation(api.admin.setUserDisabled, args);
      return { ok: true };
    },
  },

  {
    name: "admin_delete_workspace",
    scope: "admin",
    description:
      "Deletes any workspace and everything in it, permanently, without being " +
      "a member of it. Ask the person you are working for before calling this.",
    input: object({ workspaceId: string("Workspace id.") }, ["workspaceId"]),
    run: async (session, args) => {
      await session.mutation(api.admin.deleteWorkspace, args);
      return { ok: true, note: "Workspace archived; contents are being purged." };
    },
  },
];
