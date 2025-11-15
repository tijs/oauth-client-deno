/**
 * @fileoverview Main OAuth client implementation for AT Protocol authentication
 * @module
 */

import { isValidHandle } from "@atproto/syntax";
import type { AuthorizeOptions, OAuthClientConfig, OAuthSession, OAuthStorage } from "./types.ts";
import { Session, type SessionData } from "./session.ts";
import { generateDPoPKeyPair } from "./dpop.ts";
import {
  AuthorizationError,
  InvalidHandleError,
  InvalidStateError,
  NetworkError,
  OAuthError,
  RefreshTokenExpiredError,
  RefreshTokenRevokedError,
  SessionError,
  SessionNotFoundError,
  TokenExchangeError,
} from "./errors.ts";
import { createDefaultResolver, discoverOAuthEndpointsFromPDS } from "./resolvers.ts";
import { generateCodeChallenge, generateCodeVerifier } from "./pkce.ts";
import { exchangeCodeForTokens, refreshTokens } from "./token-exchange.ts";
import type { Logger } from "./logger.ts";
import { NoOpLogger } from "./logger.ts";

/** PKCE state TTL in seconds (10 minutes) */
const PKCE_STATE_TTL = 600;

/**
 * AT Protocol OAuth client for Deno environments.
 *
 * Drop-in replacement for @atproto/oauth-client-node that uses Web Crypto API
 * instead of Node.js-specific crypto implementations. Provides complete OAuth 2.0
 * + DPoP authentication flow for AT Protocol applications.
 *
 * @example Basic OAuth flow
 * ```ts
 * const client = new OAuthClient({
 *   clientId: "https://myapp.com/client-metadata.json",
 *   redirectUri: "https://myapp.com/oauth/callback",
 *   storage: new MemoryStorage(),
 * });
 *
 * // Start authorization
 * const authUrl = await client.authorize("alice.bsky.social");
 *
 * // Handle callback
 * const { session } = await client.callback(params);
 *
 * // Use authenticated session
 * const response = await session.makeRequest("GET", "https://bsky.social/xrpc/com.atproto.repo.listRecords");
 * ```
 *
 * @example Custom logging
 * ```ts
 * import { ConsoleLogger } from "@tijs/oauth-client-deno";
 *
 * const client = new OAuthClient({
 *   // ... other config
 *   logger: new ConsoleLogger(), // Enable debug logging
 * });
 * ```
 */
export class OAuthClient {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly storage: OAuthStorage;
  private readonly handleResolver: (handle: string) => Promise<{ did: string; pdsUrl: string }>;
  private readonly logger: Logger;

  /**
   * Per-session lock manager to prevent concurrent restore/refresh operations.
   * Maps sessionId to the in-flight restore Promise to queue concurrent requests.
   */
  private readonly restoreLocks = new Map<string, Promise<Session>>();

  /**
   * Per-DID lock manager to prevent concurrent refresh operations.
   * Maps DID to the in-flight refresh Promise to queue concurrent requests.
   */
  private readonly refreshLocks = new Map<string, Promise<Session>>();

  /**
   * Create a new OAuth client instance.
   *
   * @param config - OAuth client configuration options
   * @throws {OAuthError} When required configuration is missing or invalid
   *
   * @example
   * ```ts
   * const client = new OAuthClient({
   *   clientId: "https://myapp.com/client-metadata.json",
   *   redirectUri: "https://myapp.com/oauth/callback",
   *   storage: new MemoryStorage(),
   *   handleResolver: new SlingshotResolver(), // optional
   *   slingshotUrl: "https://custom-slingshot.com", // optional
   *   logger: new ConsoleLogger(), // optional
   * });
   * ```
   */
  constructor(config: OAuthClientConfig) {
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.storage = config.storage;
    this.logger = config.logger ?? new NoOpLogger();

    // Create handle resolver - either custom or default with optional Slingshot URL
    const resolver = config.handleResolver ?? createDefaultResolver(config.slingshotUrl);
    this.handleResolver = (handle: string) => resolver.resolve(handle);

    // Validate configuration
    if (!this.clientId) {
      throw new OAuthError("clientId is required");
    }
    if (!this.redirectUri) {
      throw new OAuthError("redirectUri is required");
    }

    this.logger.debug("OAuth client initialized", { clientId: this.clientId });
  }

  /**
   * Initiate OAuth authorization flow for an AT Protocol handle.
   *
   * Resolves the handle to a DID and PDS, discovers OAuth endpoints, generates
   * PKCE parameters, and creates a Pushed Authorization Request (PAR). Returns
   * the authorization URL where users should be redirected to complete authentication.
   *
   * @param handle - AT Protocol handle (e.g., "alice.bsky.social")
   * @param options - Additional authorization options
   * @returns Promise resolving to authorization URL for user redirection
   * @throws {InvalidHandleError} When handle format is invalid
   * @throws {HandleResolutionError} When handle cannot be resolved to DID/PDS
   * @throws {OAuthError} When OAuth endpoint discovery or PAR fails
   *
   * @example
   * ```ts
   * const authUrl = await client.authorize("alice.bsky.social", {
   *   state: "custom-state-value", // optional
   *   scope: "atproto transition:generic", // optional, has default
   *   loginHint: "alice.bsky.social", // optional
   * });
   *
   * // Redirect user to authUrl
   * window.location.href = authUrl;
   * ```
   */
  async authorize(
    handle: string,
    options?: AuthorizeOptions,
  ): Promise<URL> {
    if (!isValidHandle(handle)) {
      this.logger.error("Invalid handle format", { handle });
      throw new InvalidHandleError(handle);
    }

    this.logger.info("Starting authorization flow", { handle });

    try {
      // Resolve handle to get user's PDS and DID
      this.logger.debug("Resolving handle to DID and PDS", { handle });
      const resolved = await this.handleResolver(handle);
      this.logger.debug("Handle resolved", { did: resolved.did, pdsUrl: resolved.pdsUrl });

      // Discover OAuth endpoints from the PDS
      const oauthEndpoints = await discoverOAuthEndpointsFromPDS(resolved.pdsUrl);
      const authServer = this.extractAuthServer(oauthEndpoints.authorizationEndpoint);
      this.logger.debug("OAuth endpoints discovered", { authServer });

      // Generate PKCE parameters
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = options?.state ?? crypto.randomUUID();

      // Store PKCE data for callback
      await this.storage.set(`pkce:${state}`, {
        codeVerifier,
        authServer,
        handle: handle,
        did: resolved.did,
        pdsUrl: resolved.pdsUrl,
      }, { ttl: PKCE_STATE_TTL });

      this.logger.debug("PKCE state stored", { state });

      // Pushed Authorization Request (PAR) - required by most AT Protocol servers
      const parUrl = await this.pushAuthorizationRequest(
        authServer,
        {
          codeChallenge,
          state,
          scope: options?.scope ?? "atproto transition:generic",
          loginHint: options?.loginHint ?? handle,
        },
      );

      this.logger.info("Authorization URL created", { parUrl });
      return new URL(parUrl);
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      this.logger.error("Authorization failed", { error });
      throw new OAuthError("Failed to initiate authorization", error as Error);
    }
  }

  /**
   * Handle OAuth callback and complete authorization code exchange.
   *
   * Processes the OAuth callback parameters, validates the state parameter,
   * generates DPoP keys, and exchanges the authorization code for access/refresh
   * tokens. Returns an authenticated session ready for API requests.
   *
   * @param params - OAuth callback parameters from redirect URL
   * @returns Promise resolving to authenticated session
   * @throws {AuthorizationError} When OAuth authorization failed (error in callback)
   * @throws {OAuthError} When authorization code is missing
   * @throws {InvalidStateError} When state parameter is invalid or expired
   * @throws {TokenExchangeError} When token exchange fails
   *
   * @example
   * ```ts
   * // Extract callback parameters from URL
   * const url = new URL(window.location.href);
   * const params = new URLSearchParams(url.search);
   *
   * const { session } = await client.callback(params);
   * console.log("Authenticated as:", session.handle);
   * ```
   */
  async callback(
    params: URLSearchParams,
  ): Promise<{ session: OAuthSession; state: string | null }> {
    const error = params.get("error");
    if (error) {
      this.logger.error("Authorization callback error", {
        error,
        description: params.get("error_description"),
      });
      throw new AuthorizationError(error, params.get("error_description") || undefined);
    }

    const code = params.get("code");
    if (!code) {
      this.logger.error("Missing authorization code in callback");
      throw new OAuthError("Missing authorization code in callback");
    }

    const state = params.get("state") || "";

    this.logger.info("Processing authorization callback", { state });

    // Retrieve PKCE data
    const pkceData = await this.storage.get<{
      codeVerifier: string;
      authServer: string;
      handle: string;
      did: string;
      pdsUrl: string;
    }>(`pkce:${state}`);

    if (!pkceData) {
      this.logger.error("Invalid or expired state parameter", { state });
      throw new InvalidStateError();
    }

    try {
      // Generate DPoP keys for token exchange
      this.logger.debug("Generating DPoP keys");
      const dpopKeys = await generateDPoPKeyPair();

      // Exchange authorization code for tokens
      const tokens = await exchangeCodeForTokens(
        pkceData.authServer,
        code,
        pkceData.codeVerifier,
        this.clientId,
        this.redirectUri,
        dpopKeys,
        this.logger,
      );

      // Create session
      const sessionData: SessionData = {
        did: pkceData.did,
        handle: pkceData.handle,
        pdsUrl: pkceData.pdsUrl,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        dpopPrivateKeyJWK: dpopKeys.privateKeyJWK,
        dpopPublicKeyJWK: dpopKeys.publicKeyJWK,
        tokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
      };

      const session = new Session(sessionData);

      // Clean up PKCE data
      await this.storage.delete(`pkce:${state}`);

      this.logger.info("Authorization callback completed", { did: pkceData.did });
      return { session: session, state: params.get("state") };
    } catch (error) {
      // Clean up PKCE data even on error
      await this.storage.delete(`pkce:${state}`);

      if (error instanceof OAuthError) {
        throw error;
      }
      this.logger.error("Token exchange failed", { error });
      throw new TokenExchangeError("Token exchange failed", undefined, error as Error);
    }
  }

  /**
   * Restore an authenticated session from storage.
   *
   * Retrieves a previously stored session by its ID and automatically refreshes
   * the access token if it has expired. Throws errors if the session doesn't exist
   * or cannot be restored.
   *
   * **Concurrency safe:** If multiple concurrent requests try to restore the same
   * session while it's being refreshed, they will all wait for and share the result
   * of the first refresh operation. This prevents race conditions and duplicate
   * token refresh requests.
   *
   * @param sessionId - Unique identifier for the stored session
   * @returns Promise resolving to restored session
   * @throws {SessionNotFoundError} When session doesn't exist in storage
   * @throws {RefreshTokenExpiredError} When refresh token has expired
   * @throws {NetworkError} When network request fails
   * @throws {TokenExchangeError} When token refresh fails
   *
   * @example
   * ```ts
   * try {
   *   const session = await client.restore("user-session-123");
   *   console.log("Welcome back,", session.handle);
   * } catch (error) {
   *   if (error instanceof SessionNotFoundError) {
   *     console.log("Please log in again");
   *   } else if (error instanceof RefreshTokenExpiredError) {
   *     console.log("Session expired, please re-authenticate");
   *   } else {
   *     throw error;
   *   }
   * }
   * ```
   */
  restore(sessionId: string): Promise<Session> {
    // Check if another request is already restoring/refreshing this session
    const existingLock = this.restoreLocks.get(sessionId);
    if (existingLock) {
      this.logger.debug("Waiting for in-flight restore operation", { sessionId });
      // Wait for and reuse the in-flight restore operation
      return existingLock;
    }

    // Create a new restore operation
    const restorePromise = (async () => {
      try {
        this.logger.info("Restoring session", { sessionId });

        const sessionData = await this.storage.get<SessionData>(`session:${sessionId}`);
        if (!sessionData) {
          this.logger.warn("Session not found in storage", { sessionId });
          throw new SessionNotFoundError(sessionId);
        }

        const session = Session.fromJSON(sessionData);

        // Auto-refresh if needed
        if (session.isExpired) {
          this.logger.info("Session expired, refreshing token", {
            sessionId,
            did: session.did,
          });

          try {
            const refreshedSession = await this.refresh(session);
            await this.storage.set(`session:${sessionId}`, refreshedSession.toJSON());
            this.logger.info("Session restored and refreshed", { sessionId });
            return refreshedSession;
          } catch (error) {
            this.logger.error("Token refresh failed during restore", {
              sessionId,
              error,
            });

            // Re-throw with proper error classification
            if (error instanceof TokenExchangeError) {
              // Check for specific refresh token error responses
              if (error.errorCode === "invalid_grant") {
                throw new RefreshTokenExpiredError(error);
              }
              throw error;
            }
            if (error instanceof NetworkError) {
              throw error;
            }
            // Wrap unknown errors as generic token exchange errors
            throw new TokenExchangeError(
              "Token refresh failed",
              undefined,
              error as Error,
            );
          }
        }

        this.logger.info("Session restored", { sessionId });
        return session;
      } catch (error) {
        // Re-throw typed errors as-is
        if (
          error instanceof SessionNotFoundError ||
          error instanceof RefreshTokenExpiredError ||
          error instanceof RefreshTokenRevokedError ||
          error instanceof NetworkError ||
          error instanceof TokenExchangeError
        ) {
          throw error;
        }

        // Wrap unexpected errors
        this.logger.error("Session restoration failed", { sessionId, error });
        throw new SessionError(
          `Failed to restore session: ${sessionId}`,
          error as Error,
        );
      } finally {
        // Always cleanup the lock when done
        this.restoreLocks.delete(sessionId);
      }
    })();

    // Store the promise so concurrent requests can wait for it
    this.restoreLocks.set(sessionId, restorePromise);

    return restorePromise;
  }

  /**
   * Store an authenticated session in storage for later retrieval.
   *
   * Persists the session data using the configured storage backend so it can
   * be restored later with {@link restore}. The session is serialized before
   * storage.
   *
   * @param sessionId - Unique identifier for the session
   * @param session - Authenticated session to store
   *
   * @example
   * ```ts
   * const { session } = await client.callback(params);
   * await client.store("user-session-123", session);
   * console.log("Session stored successfully");
   * ```
   */
  async store(sessionId: string, session: Session): Promise<void> {
    this.logger.info("Storing session", { sessionId, did: session.did });
    await this.storage.set(`session:${sessionId}`, session.toJSON());
  }

  /**
   * Refresh access token using refresh token.
   *
   * Exchanges the current refresh token for new access and refresh tokens using
   * the OAuth 2.0 refresh_token grant type with DPoP authentication. The session
   * is updated in-place with the new token data.
   *
   * **Concurrency safe:** If multiple concurrent requests try to refresh the same
   * session, they will all wait for and share the result of the first refresh
   * operation. This prevents duplicate token refresh requests.
   *
   * @param session Current session with valid refresh token
   * @returns New session with refreshed tokens
   * @throws {TokenExchangeError} When token refresh fails or refresh token is invalid
   *
   * @example
   * ```ts
   * if (session.isExpired) {
   *   try {
   *     const refreshedSession = await client.refresh(session);
   *     console.log("Token refreshed, expires in:", refreshedSession.timeUntilExpiry, "ms");
   *   } catch (error) {
   *     if (error instanceof RefreshTokenExpiredError) {
   *       console.log("Please log in again");
   *     }
   *   }
   * }
   * ```
   */
  refresh(session: Session): Promise<Session> {
    const did = session.did;

    // Check if another request is already refreshing this session
    const existingLock = this.refreshLocks.get(did);
    if (existingLock) {
      this.logger.debug("Waiting for in-flight refresh operation", { did });
      return existingLock;
    }

    // Create a new refresh operation
    const refreshPromise = (async () => {
      this.logger.info("Refreshing tokens", { did });

      try {
        // Discover OAuth endpoints from PDS
        const oauthEndpoints = await discoverOAuthEndpointsFromPDS(session.pdsUrl);
        this.logger.debug("Token endpoint discovered", {
          tokenEndpoint: oauthEndpoints.tokenEndpoint,
        });

        const refreshedTokens = await refreshTokens(
          oauthEndpoints.tokenEndpoint,
          session.refreshToken,
          this.clientId,
          session.toJSON().dpopPrivateKeyJWK,
          session.toJSON().dpopPublicKeyJWK,
          this.logger,
        );

        // Update session with new tokens
        session.updateTokens(refreshedTokens);
        this.logger.info("Token refresh successful", { did });
        return session;
      } catch (error) {
        this.logger.error("Token refresh failed", { did, error });

        // Classify the error based on type
        if (error instanceof TokenExchangeError) {
          // Already a TokenExchangeError, check for specific grant errors
          if (error.errorCode === "invalid_grant") {
            throw new RefreshTokenExpiredError(error);
          }
          throw error;
        }

        // Check for network-related errors
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (
            errorMessage.includes("network") ||
            errorMessage.includes("timeout") ||
            errorMessage.includes("connection") ||
            errorMessage.includes("fetch")
          ) {
            throw new NetworkError("Failed to reach token endpoint", error);
          }
        }

        // Default to generic token exchange error
        throw new TokenExchangeError("Token refresh failed", undefined, error as Error);
      } finally {
        // Always cleanup the lock when done
        this.refreshLocks.delete(did);
      }
    })();

    // Store the promise so concurrent requests can wait for it
    this.refreshLocks.set(did, refreshPromise);

    return refreshPromise;
  }

  /**
   * Sign out a user session by revoking tokens and cleaning up storage.
   *
   * Attempts to revoke the refresh token at the OAuth server (best effort)
   * and removes the session from local storage. This ensures proper cleanup
   * and prevents token reuse.
   *
   * @param sessionId - Session identifier to remove from storage
   * @param session - Session containing tokens to revoke
   *
   * @example
   * ```ts
   * await client.signOut("user-session-123", session);
   * console.log("User signed out successfully");
   * ```
   */
  async signOut(sessionId: string, session: Session): Promise<void> {
    this.logger.info("Signing out session", { sessionId, did: session.did });

    try {
      // Try to revoke tokens (best effort)
      const oauthEndpoints = await discoverOAuthEndpointsFromPDS(session.pdsUrl);
      const revokeEndpoint = oauthEndpoints.revocationEndpoint;

      if (revokeEndpoint) {
        this.logger.debug("Revoking refresh token", { revokeEndpoint });

        // Revoke refresh token
        const response = await fetch(revokeEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            token: session.refreshToken,
            client_id: this.clientId,
          }),
        });

        if (!response.ok) {
          this.logger.warn("Token revocation failed", {
            status: response.status,
            statusText: response.statusText,
          });
        } else {
          this.logger.debug("Token revocation successful");
        }
      } else {
        this.logger.warn("No revocation endpoint available");
      }
    } catch (error) {
      // Ignore revocation errors - clean up storage anyway
      this.logger.warn("Token revocation error (continuing with cleanup)", { error });
    } finally {
      // Always clean up storage
      await this.storage.delete(`session:${sessionId}`);
      this.logger.info("Session signed out", { sessionId });
    }
  }

  // Private helper methods

  private extractAuthServer(authorizationEndpoint: string): string {
    return authorizationEndpoint.replace(/\/oauth\/authorize$/, "");
  }

  private async pushAuthorizationRequest(
    authServer: string,
    params: {
      codeChallenge: string;
      state: string;
      scope: string;
      loginHint: string;
    },
  ): Promise<string> {
    const parParams = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: params.scope,
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256",
      state: params.state,
      login_hint: params.loginHint,
    });

    this.logger.debug("Sending Pushed Authorization Request", { authServer });

    const response = await fetch(`${authServer}/oauth/par`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: parParams,
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error("PAR request failed", { status: response.status, error });
      throw new OAuthError(`Pushed Authorization Request failed: ${error}`);
    }

    const result = await response.json();
    const authParams = new URLSearchParams({
      client_id: this.clientId,
      request_uri: result.request_uri,
    });

    return `${authServer}/oauth/authorize?${authParams}`;
  }
}
