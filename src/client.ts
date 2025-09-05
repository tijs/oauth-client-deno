/**
 * @fileoverview Main OAuth client implementation for AT Protocol authentication
 * @module
 */

import { isValidHandle } from "npm:@atproto/syntax@0.4.0";
import type {
  AuthorizeOptions,
  CallbackOptions,
  OAuthClientConfig,
  OAuthSession,
  OAuthStorage,
} from "./types.ts";
import { Session, type SessionData } from "./session.ts";
import { generateDPoPKeyPair, generateDPoPProof } from "./dpop.ts";
import {
  AuthorizationError,
  InvalidHandleError,
  InvalidStateError,
  OAuthError,
  TokenExchangeError,
} from "./errors.ts";
import { createDefaultResolver, discoverOAuthEndpointsFromPDS } from "./resolvers.ts";

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
 * const { session } = await client.callback({ code: "auth_code", state: "state" });
 *
 * // Use authenticated session
 * const response = await session.makeRequest("GET", "https://bsky.social/xrpc/com.atproto.repo.listRecords");
 * ```
 *
 * @example Custom handle resolution
 * ```ts
 * const client = new OAuthClient({
 *   // ... other config
 *   handleResolver: new DirectoryResolver(), // Use AT Protocol directory instead of Slingshot
 *   slingshotUrl: "https://my-slingshot.example.com", // Or custom Slingshot URL
 * });
 * ```
 */
export class OAuthClient {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly storage: OAuthStorage;
  private readonly handleResolver: (handle: string) => Promise<{ did: string; pdsUrl: string }>;

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
   * });
   * ```
   */
  constructor(config: OAuthClientConfig) {
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.storage = config.storage;

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
      throw new InvalidHandleError(handle);
    }

    try {
      // Resolve handle to get user's PDS and DID
      const resolved = await this.handleResolver(handle);

      // Discover OAuth endpoints from the PDS
      const oauthEndpoints = await discoverOAuthEndpointsFromPDS(resolved.pdsUrl);
      const authServer = this.extractAuthServer(oauthEndpoints.authorizationEndpoint);

      // Generate PKCE parameters
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);
      const state = options?.state ?? crypto.randomUUID();

      // Store PKCE data for callback
      await this.storage.set(`pkce:${state}`, {
        codeVerifier,
        authServer,
        handle: handle,
        did: resolved.did,
        pdsUrl: resolved.pdsUrl,
      }, { ttl: 600 }); // 10 minutes

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

      return new URL(parUrl);
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
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
   * const params = {
   *   code: url.searchParams.get("code")!,
   *   state: url.searchParams.get("state")!,
   *   error: url.searchParams.get("error"),
   *   error_description: url.searchParams.get("error_description"),
   * };
   *
   * const { session } = await client.callback(params);
   * console.log("Authenticated as:", session.handle);
   * ```
   */
  async callback(
    params: URLSearchParams,
    _options?: CallbackOptions,
  ): Promise<{ session: OAuthSession; state: string | null }> {
    const error = params.get("error");
    if (error) {
      throw new AuthorizationError(error, params.get("error_description") || undefined);
    }

    const code = params.get("code");
    if (!code) {
      throw new OAuthError("Missing authorization code in callback");
    }

    const state = params.get("state") || "";

    // Retrieve PKCE data
    const pkceData = await this.storage.get<{
      codeVerifier: string;
      authServer: string;
      handle: string;
      did: string;
      pdsUrl: string;
    }>(`pkce:${state}`);
    if (!pkceData) {
      throw new InvalidStateError();
    }

    try {
      // Generate DPoP keys for token exchange
      const dpopKeys = await generateDPoPKeyPair();

      // Exchange authorization code for tokens
      const tokens = await this.exchangeCodeForTokens(
        pkceData.authServer,
        code,
        pkceData.codeVerifier,
        dpopKeys,
      );

      // Create session
      const sessionData: SessionData = {
        did: pkceData.did,
        handle: pkceData.handle,
        pdsUrl: pkceData.pdsUrl,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        dpopPrivateKeyJWK: dpopKeys.privateKeyJWK,
        dpopPublicKeyJWK: dpopKeys.publicKeyJWK,
        tokenExpiresAt: Date.now() + (tokens.expires_in * 1000),
      };

      const session = new Session(sessionData);

      // Clean up PKCE data
      await this.storage.delete(`pkce:${state}`);

      return { session: session as OAuthSession, state: params.get("state") };
    } catch (error) {
      // Clean up PKCE data even on error
      await this.storage.delete(`pkce:${state}`);

      if (error instanceof OAuthError) {
        throw error;
      }
      throw new TokenExchangeError("Token exchange failed", undefined, error as Error);
    }
  }

  /**
   * Restore an authenticated session from storage.
   *
   * Retrieves a previously stored session by its ID and automatically refreshes
   * the access token if it has expired. Returns null if the session doesn't exist
   * or cannot be restored.
   *
   * @param sessionId - Unique identifier for the stored session
   * @returns Promise resolving to restored session, or null if not found
   * @example
   * ```ts
   * const session = await client.restore("user-session-123");
   * if (session) {
   *   console.log("Welcome back,", session.handle);
   * } else {
   *   console.log("Please log in again");
   * }
   * ```
   */
  async restore(sessionId: string): Promise<Session | null> {
    try {
      const sessionData = await this.storage.get<SessionData>(`session:${sessionId}`);
      if (!sessionData) {
        return null;
      }

      const session = Session.fromJSON(sessionData);

      // Auto-refresh if needed
      if (session.isExpired) {
        const refreshedSession = await this.refresh(session);
        await this.storage.set(`session:${sessionId}`, refreshedSession.toJSON());
        return refreshedSession;
      }

      return session;
    } catch {
      return null;
    }
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
   * @example
   * ```ts
   * const { session } = await client.callback(params);
   * await client.store("user-session-123", session);
   * console.log("Session stored successfully");
   * ```
   */
  async store(sessionId: string, session: Session): Promise<void> {
    await this.storage.set(`session:${sessionId}`, session.toJSON());
  }

  /**
   * Refresh access token using refresh token.
   *
   * Exchanges the current refresh token for new access and refresh tokens using
   * the OAuth 2.0 refresh_token grant type with DPoP authentication. The session
   * is updated in-place with the new token data.
   *
   * @param session Current session with valid refresh token
   * @returns New session with refreshed tokens
   * @throws {TokenExchangeError} When token refresh fails or refresh token is invalid
   *
   * @example
   * ```ts
   * if (session.isExpired) {
   *   const refreshedSession = await client.refresh(session);
   *   console.log("Token refreshed, expires in:", refreshedSession.timeUntilExpiry, "ms");
   * }
   * ```
   */
  async refresh(session: Session): Promise<Session> {
    try {
      const oauthEndpoints = await discoverOAuthEndpointsFromPDS(session.pdsUrl);
      const refreshedTokens = await this.refreshTokens(
        oauthEndpoints.tokenEndpoint,
        session.refreshToken,
        session.toJSON().dpopPrivateKeyJWK,
        session.toJSON().dpopPublicKeyJWK,
      );

      // Update session with new tokens
      session.updateTokens(refreshedTokens);
      return session;
    } catch (error) {
      throw new TokenExchangeError("Token refresh failed", undefined, error as Error);
    }
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
   * @example
   * ```ts
   * await client.signOut("user-session-123", session);
   * console.log("User signed out successfully");
   * ```
   */
  async signOut(sessionId: string, session: Session): Promise<void> {
    try {
      // Try to revoke tokens (best effort)
      const oauthEndpoints = await discoverOAuthEndpointsFromPDS(session.pdsUrl);
      const revokeEndpoint = oauthEndpoints.revocationEndpoint;

      if (revokeEndpoint) {
        // Revoke refresh token
        await fetch(revokeEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            token: session.refreshToken,
            client_id: this.clientId,
          }),
        });
      }
    } catch {
      // Ignore revocation errors - clean up storage anyway
    } finally {
      // Always clean up storage
      await this.storage.delete(`session:${sessionId}`);
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

    const response = await fetch(`${authServer}/oauth/par`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: parParams,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new OAuthError(`Pushed Authorization Request failed: ${error}`);
    }

    const result = await response.json();
    const authParams = new URLSearchParams({
      client_id: this.clientId,
      request_uri: result.request_uri,
    });

    return `${authServer}/oauth/authorize?${authParams}`;
  }

  private async exchangeCodeForTokens(
    authServer: string,
    code: string,
    codeVerifier: string,
    dpopKeys: { privateKey: CryptoKey; publicKeyJWK: JsonWebKey },
  ) {
    const tokenUrl = `${authServer}/oauth/token`;

    // Create DPoP proof for token exchange
    const dpopProof = await generateDPoPProof(
      "POST",
      tokenUrl,
      dpopKeys.privateKey,
      dpopKeys.publicKeyJWK,
    );

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: codeVerifier,
    });

    let response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "DPoP": dpopProof,
      },
      body: tokenBody,
    });

    // Handle DPoP nonce requirement - AT Protocol uses 400 status
    if (!response.ok && response.status === 400) {
      const nonce = response.headers.get("DPoP-Nonce");
      if (nonce) {
        // Retry with nonce
        const dpopProofWithNonce = await generateDPoPProof(
          "POST",
          tokenUrl,
          dpopKeys.privateKey,
          dpopKeys.publicKeyJWK,
          undefined,
          nonce,
        );

        response = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "DPoP": dpopProofWithNonce,
          },
          body: tokenBody,
        });
      }
    }

    if (!response.ok) {
      const error = await response.text();
      throw new TokenExchangeError(error);
    }

    return await response.json();
  }

  private async refreshTokens(
    tokenEndpoint: string,
    refreshToken: string,
    privateKeyJWK: JsonWebKey,
    publicKeyJWK: JsonWebKey,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    try {
      // Import private key for DPoP signing
      const { importPrivateKeyFromJWK } = await import("./dpop.ts");
      const privateKey = await importPrivateKeyFromJWK(privateKeyJWK);

      // Create DPoP proof for token refresh
      const dpopProof = await generateDPoPProof(
        "POST",
        tokenEndpoint,
        privateKey,
        publicKeyJWK,
      );

      const tokenBody = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: refreshToken,
      });

      let response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "DPoP": dpopProof,
        },
        body: tokenBody,
      });

      // Handle DPoP nonce requirement - AT Protocol uses 400 status
      if (!response.ok && response.status === 400) {
        const nonce = response.headers.get("DPoP-Nonce");
        if (nonce) {
          // Retry with nonce
          const dpopProofWithNonce = await generateDPoPProof(
            "POST",
            tokenEndpoint,
            privateKey,
            publicKeyJWK,
            undefined,
            nonce,
          );

          response = await fetch(tokenEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "DPoP": dpopProofWithNonce,
            },
            body: tokenBody,
          });
        }
      }

      if (!response.ok) {
        const error = await response.text();
        throw new TokenExchangeError(`Token refresh failed: ${error}`);
      }

      const tokens = await response.json();

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token, // May be undefined if server doesn't rotate refresh tokens
        expiresIn: tokens.expires_in,
      };
    } catch (error) {
      if (error instanceof TokenExchangeError) {
        throw error;
      }
      throw new TokenExchangeError("Token refresh failed", undefined, error as Error);
    }
  }

  // PKCE helper methods
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
      .replace(/=/g, "");
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/[+/]/g, (match) => match === "+" ? "-" : "_")
      .replace(/=/g, "");
  }
}
