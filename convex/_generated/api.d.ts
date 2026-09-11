/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as api_ from "../api.js";
import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as forms from "../forms.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_validate from "../lib/validate.js";
import type * as publicForms from "../publicForms.js";
import type * as submissions from "../submissions.js";
import type * as webhooks from "../webhooks.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  api: typeof api_;
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  cleanup: typeof cleanup;
  crons: typeof crons;
  forms: typeof forms;
  http: typeof http;
  "lib/authz": typeof lib_authz;
  "lib/crypto": typeof lib_crypto;
  "lib/events": typeof lib_events;
  "lib/validate": typeof lib_validate;
  publicForms: typeof publicForms;
  submissions: typeof submissions;
  webhooks: typeof webhooks;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
