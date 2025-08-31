/**
 * @fileoverview Core types and interfaces for the AT Protocol OAuth client
 * @module
 */

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
   * Slingshot resolver URL (optional, defaults to https://slingshot.bsky.app)
   * Only used when using the default handle resolver
   */
  slingshotUrl?: string;
}

export interface AuthorizationUrlOptions {
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

export interface CallbackParams {
  /**
   * Authorization code from OAuth callback
   */
  code: string;

  /**
   * State parameter for CSRF validation
   */
  state?: string;

  /**
   * Error code if authorization failed
   */
  error?: string;

  /**
   * Error description if authorization failed
   */
  error_description?: string;
}

export interface CallbackResult {
  /**
   * Authenticated session
   */
  session: SessionData;
}
