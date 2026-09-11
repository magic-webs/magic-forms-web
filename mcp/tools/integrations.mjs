/**
 * Webhook and API key tools.
 *
 * Both are workspace-admin territory. An API key's plaintext is returned once,
 * by the call that mints it, and is never recoverable afterwards — hand it
 * straight to whoever asked for it rather than storing it.
 */
import { api } from "../convex.mjs";
import {
  WEBHOOK_EVENTS,
  arrayOf,
  boolean,
  object,
  oneOf,
  string,
} from "../schema.mjs";

export const integrationTools = [
  {
    name: "list_webhooks",
    scope: "company",
    description:
      "Webhook endpoints in a workspace, with the events each listens for and " +
      "its delivery success and failure counts.",
    input: object({ workspaceId: string("Workspace id.") }, ["workspaceId"]),
    run: (session, args) =>
      session.query(api.webhooks.listByWorkspace, {
        workspaceId: args.workspaceId,
      }),
  },

  {
    name: "create_webhook",
    scope: "company",
    description:
      "Registers an endpoint to be called on the events you pick. Scope " +
      "it to one form with formId, or leave that out for the whole workspace. " +
      "Deliveries are signed with a generated secret and retried twice.",
    input: object(
      {
        workspaceId: string("Workspace id."),
        name: string("A name for this endpoint."),
        url: string("Absolute http:// or https:// URL to POST to."),
        events: arrayOf(
          oneOf(WEBHOOK_EVENTS, "An event name."),
          "Events this endpoint should receive. At least one.",
        ),
        formId: string("Limit to one form. Omit for the whole workspace."),
        headers: arrayOf(
          object(
            { key: string("Header name."), value: string("Header value.") },
            ["key", "value"],
          ),
          "Extra headers sent with every delivery.",
        ),
      },
      ["workspaceId", "name", "url", "events"],
    ),
    run: async (session, args) => {
      const webhookId = await session.mutation(api.webhooks.create, args);
      return { webhookId };
    },
  },

  {
    name: "update_webhook",
    scope: "company",
    description:
      "Changes a webhook endpoint, or enables and disables it. Only the " +
      "properties you pass are touched.",
    input: object(
      {
        webhookId: string("Webhook id."),
        name: string("New name."),
        url: string("New absolute http:// or https:// URL."),
        events: arrayOf(
          oneOf(WEBHOOK_EVENTS, "An event name."),
          "Replacement list of events.",
        ),
        enabled: boolean("Whether deliveries are attempted."),
      },
      ["webhookId"],
    ),
    run: async (session, args) => {
      await session.mutation(api.webhooks.update, args);
      return { ok: true };
    },
  },

  {
    name: "test_webhook",
    scope: "company",
    description:
      "Sends a signed test delivery to a webhook so you can confirm the " +
      "endpoint accepts it. Check the result with list_webhook_deliveries.",
    input: object({ webhookId: string("Webhook id.") }, ["webhookId"]),
    run: async (session, args) => {
      const deliveryId = await session.mutation(api.webhooks.sendTest, args);
      return { deliveryId };
    },
  },

  {
    name: "list_webhook_deliveries",
    scope: "company",
    description:
      "The delivery log: status code, response body, duration and attempt " +
      "number for recent webhook calls.",
    input: object(
      {
        workspaceId: string("Workspace id."),
        webhookId: string("Limit to one endpoint."),
      },
      ["workspaceId"],
    ),
    run: (session, args) => session.query(api.webhooks.listDeliveries, args),
  },

  {
    name: "remove_webhook",
    scope: "company",
    description: "Deletes a webhook endpoint and its delivery log.",
    input: object({ webhookId: string("Webhook id.") }, ["webhookId"]),
    run: async (session, args) => {
      await session.mutation(api.webhooks.remove, args);
      return { ok: true };
    },
  },

  // --- API keys --------------------------------------------------------------

  {
    name: "list_api_keys",
    scope: "company",
    description:
      "API keys for a workspace. Only the first 16 characters of each are " +
      "stored in readable form, so this cannot show a whole key.",
    input: object({ workspaceId: string("Workspace id.") }, ["workspaceId"]),
    run: (session, args) =>
      session.query(api.apiKeys.listByWorkspace, {
        workspaceId: args.workspaceId,
      }),
  },

  {
    name: "create_api_key",
    scope: "company",
    description:
      "Mints a read key for the submissions API. The key is returned exactly " +
      "once — only its digest is stored, so it cannot be shown again.",
    input: object(
      {
        workspaceId: string("Workspace id."),
        name: string("What this key is for."),
      },
      ["workspaceId", "name"],
    ),
    run: (session, args) => session.action(api.apiKeys.create, args),
  },

  {
    name: "revoke_api_key",
    scope: "company",
    description:
      "Revokes an API key. Calls made with it start failing immediately.",
    input: object({ apiKeyId: string("API key id.") }, ["apiKeyId"]),
    run: async (session, args) => {
      await session.mutation(api.apiKeys.revoke, args);
      return { ok: true };
    },
  },
];
