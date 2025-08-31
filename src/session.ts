/**
 * @fileoverview Session management for AT Protocol OAuth authentication
 * @module
 */

import type { SessionData } from "./types.ts";
import { importPrivateKeyFromJWK, makeDPoPRequest } from "./dpop.ts";
import { SessionError } from "./errors.ts";

export type { SessionData };

/**
 * Authenticated session for AT Protocol OAuth.
 *
 * Represents an authenticated user session with automatic token management,
 * DPoP authentication, and convenient methods for making authenticated API requests.
 * Sessions can be serialized for storage and restored later.
 *
 * @example Basic session usage
 * ```ts
 * // Session is typically obtained from client.callback()
 * const { session } = await client.callback(callbackParams);
 *
 * // Check session properties
 * console.log("User:", session.handle, session.did);
 * console.log("PDS:", session.pdsUrl);
 * console.log("Token expires in:", session.timeUntilExpiry, "ms");
 *
 * // Make authenticated API requests
 * const response = await session.makeRequest(
 *   "GET",
 *   "https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=" + session.did
 * );
 *
 * const records = await response.json();
 * ```
 *
 * @example Session serialization
 * ```ts
 * // Serialize for storage
 * const sessionData = session.toJSON();
 * await storage.set("user-session", sessionData);
 *
 * // Restore from storage
 * const restored = Session.fromJSON(sessionData);
 * ```
 */
export class Session {
  constructor(private data: SessionData) {}

  /**
   * User's DID (Decentralized Identifier)
   */
  get did(): string {
    return this.data.did;
  }

  /**
   * User's handle (e.g., "alice.bsky.social")
   */
  get handle(): string {
    return this.data.handle;
  }

  /**
   * User's PDS (Personal Data Server) URL
   */
  get pdsUrl(): string {
    return this.data.pdsUrl;
  }

  /**
   * Current access token
   */
  get accessToken(): string {
    return this.data.accessToken;
  }

  /**
   * Refresh token for getting new access tokens
   */
  get refreshToken(): string {
    return this.data.refreshToken;
  }

  /**
   * Check if access token is expired or will expire soon
   */
  get isExpired(): boolean {
    // Consider expired if token expires within next 5 minutes
    return Date.now() + (5 * 60 * 1000) >= this.data.tokenExpiresAt;
  }

  /**
   * Time until token expires (in milliseconds)
   */
  get timeUntilExpiry(): number {
    return Math.max(0, this.data.tokenExpiresAt - Date.now());
  }

  /**
   * Make an authenticated HTTP request using DPoP authentication.
   *
   * Automatically handles DPoP proof generation and nonce challenges.
   * This is the primary method for making authenticated AT Protocol API calls.
   *
   * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param url - Target URL for the request
   * @param options - Optional request configuration
   * @param options.body - Request body as string
   * @param options.headers - Additional headers to include
   * @returns Promise resolving to the HTTP response
   * @throws {SessionError} When DPoP request generation fails
   *
   * @example GET request
   * ```ts
   * const response = await session.makeRequest(
   *   "GET",
   *   `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${session.did}`
   * );
   * const data = await response.json();
   * ```
   *
   * @example POST request with body
   * ```ts
   * const response = await session.makeRequest(
   *   "POST",
   *   "https://bsky.social/xrpc/com.atproto.repo.createRecord",
   *   {
   *     body: JSON.stringify({
   *       repo: session.did,
   *       collection: "app.bsky.feed.post",
   *       record: { text: "Hello from Deno!" }
   *     }),
   *     headers: { "Content-Type": "application/json" }
   *   }
   * );
   * ```
   */
  async makeRequest(
    method: string,
    url: string,
    options?: {
      body?: string;
      headers?: HeadersInit;
    },
  ): Promise<Response> {
    try {
      // Import private key for signing
      const privateKey = await importPrivateKeyFromJWK(
        this.data.dpopPrivateKeyJWK,
      );

      return await makeDPoPRequest(
        method,
        url,
        this.data.accessToken,
        privateKey,
        this.data.dpopPublicKeyJWK,
        options?.body,
        options?.headers,
      );
    } catch (error) {
      throw new SessionError(
        "Failed to make authenticated request",
        error as Error,
      );
    }
  }

  /**
   * Get session data for serialization/storage
   */
  toJSON(): SessionData {
    return { ...this.data };
  }

  /**
   * Create session from stored data
   */
  static fromJSON(data: SessionData): Session {
    return new Session(data);
  }

  /**
   * Update session with new token data (used during refresh)
   */
  updateTokens(tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }): void {
    this.data.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      this.data.refreshToken = tokens.refreshToken;
    }
    this.data.tokenExpiresAt = Date.now() + (tokens.expiresIn * 1000);
  }
}
