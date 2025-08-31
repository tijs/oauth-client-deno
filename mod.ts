/**
 * @fileoverview AT Protocol OAuth client for Deno
 *
 * A Deno-compatible AT Protocol OAuth client that serves as a drop-in
 * replacement for @atproto/oauth-client-node. Built specifically to solve
 * crypto compatibility issues between Node.js-specific implementations and
 * Deno runtime environments.
 *
 * Uses Web Crypto API exclusively for maximum cross-platform compatibility.
 *
 * @example Basic usage
 * ```ts
 * import { OAuthClient, MemoryStorage } from "@tijs/oauth-client-deno";
 *
 * const client = new OAuthClient({
 *   clientId: "https://myapp.com/client-metadata.json",
 *   redirectUri: "https://myapp.com/oauth/callback",
 *   storage: new MemoryStorage(),
 * });
 *
 * // Start OAuth flow
 * const authUrl = await client.authorize("alice.bsky.social");
 *
 * // Handle callback
 * const { session } = await client.callback({ code: "...", state: "..." });
 *
 * // Make authenticated requests
 * const response = await session.makeRequest("GET", "https://bsky.social/xrpc/...");
 * ```
 *
 * @module
 */

export { OAuthClient } from "./src/client.ts";
export { Session, type SessionData } from "./src/session.ts";
export { LocalStorage, MemoryStorage, SQLiteStorage, type Storage } from "./src/storage.ts";
export {
  createDefaultResolver,
  CustomResolver,
  DirectoryResolver,
  SlingshotResolver,
} from "./src/resolvers.ts";
export type {
  AuthorizeOptions,
  CallbackOptions,
  HandleResolver,
  OAuthClientConfig,
  OAuthSession,
  OAuthStorage,
} from "./src/types.ts";
export * from "./src/errors.ts";
