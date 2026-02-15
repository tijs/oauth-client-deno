/**
 * @fileoverview Core types and interfaces for the AT Protocol OAuth client
 * @module
 */

import type { Logger } from "./logger.ts";

/**
 * Storage interface for persisting OAuth sessions and state data.
 *
 * Implement this interface to create custom storage backends for the OAuth client.
 * The client uses storage to persist PKCE state during authorization flows and
 * to store authenticated sessions for later retrieval.
 *
 * @example Custom storage implementation
 * ```ts
 * class DatabaseStorage implements Storage {
 *   async get<T>(key: string): Promise<T | null> {
 *     const row = await db.query("SELECT value FROM oauth_storage WHERE key = ?", [key]);
 *     return row ? JSON.parse(row.value) : null;
 *   }
 *
 *   async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
 *     const expiresAt = options?.ttl ? Date.now() + (options.ttl * 1000) : null;
 *     await db.query("INSERT OR REPLACE INTO oauth_storage (key, value, expires_at) VALUES (?, ?, ?)",
 *       [key, JSON.stringify(value), expiresAt]);
 *   }
 *
 *   async delete(key: string): Promise<void> {
 *     await db.query("DELETE FROM oauth_storage WHERE key = ?", [key]);
 *   }
 * }
 * ```
 */
export interface OAuthStorage {
  /**
   * Retrieve a value from storage.
   *
   * @param key - Storage key to retrieve
   * @returns Promise resolving to the stored value, or null if not found or expired
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Store a value in storage.
   *
   * @param key - Storage key
   * @param value - Value to store (will be serialized)
   * @param options - Storage options
   * @param options.ttl - Time to live in seconds (optional)
   */
  set<T = unknown>(key: string, value: T, options?: { ttl?: number }): Promise<void>;

  /**
   * Delete a value from storage.
   *
   * @param key - Storage key to delete
   */
  delete(key: string): Promise<void>;
}

export interface SessionData {
  did: string;
  handle: string;
  pdsUrl: string;
  accessToken: string;
  refreshToken: string;
  dpopPrivateKeyJWK: JsonWebKey;
  dpopPublicKeyJWK: JsonWebKey;
  tokenExpiresAt: number;
}

export interface HandleResolver {
  resolve(handle: string): Promise<{ did: string; pdsUrl: string }>;
}

export interface OAuthClientConfig {
  /**
   * Client identifier (usually your app's URL + /client-metadata.json)
   */
  clientId: string;

  /**
   * OAuth redirect URI (where users return after auth)
   */
  redirectUri: string;

  /**
   * Storage implementation for sessions and state
   */
  storage: OAuthStorage;

  /**
   * Custom handle resolver (optional, uses Slingshot by default)
   * Can be configured to use different resolution services or custom logic
   */
  handleResolver?: HandleResolver;

  /**
   * Slingshot resolver URL (optional, defaults to https://slingshot.microcosm.blue)
   * Only used when using the default handle resolver
   */
  slingshotUrl?: string;

  /**
   * Logger for debugging and diagnostics (optional, defaults to no-op logger)
   * Implement the Logger interface to capture client logging output
   */
  logger?: Logger;

  /**
   * Timeout for refresh token operations in milliseconds (default: 30000).
   */
  refreshTimeout?: number;

  /**
   * Called after a session is updated (e.g., after token refresh).
   */
  onSessionUpdated?: (sessionId: string, session: OAuthSession) => void;

  /**
   * Called after a session is deleted (e.g., after sign-out).
   */
  onSessionDeleted?: (sessionId: string) => void;

  /**
   * Custom lock function for distributed refresh token locking.
   * Default uses in-memory Map locks (works for single-instance and Deno Deploy isolates).
   * Provide a custom implementation for distributed locking (e.g., Redis).
   */
  requestLock?: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
}

/**
 * Authorization options matching @atproto/oauth-client interface
 */
export interface AuthorizeOptions {
  /**
   * State parameter for CSRF protection (optional, auto-generated if not provided)
   */
  state?: string;

  /**
   * OAuth scope (defaults to "atproto transition:generic")
   */
  scope?: string;

  /**
   * Login hint for the authorization server
   */
  loginHint?: string;
}

/**
 * OAuth session interface matching @atproto/oauth-client
 */
export interface OAuthSession {
  did: string;
  handle?: string;
  accessToken: string;
  refreshToken?: string;
  sub: string;
  aud: string;
  pdsUrl: string;

  /**
   * Make authenticated request with automatic DPoP header
   */
  makeRequest(method: string, url: string, options?: RequestInit): Promise<Response>;

  /**
   * Serialize session data for storage
   */
  toJSON(): SessionData;
}
