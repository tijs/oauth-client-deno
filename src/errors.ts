/**
 * @fileoverview Custom error classes for OAuth client operations
 * @module
 */

/**
 * Base OAuth error class for all OAuth-related errors.
 *
 * Provides a common base class for all OAuth client errors with optional
 * error chaining support. All other OAuth errors extend from this class.
 *
 * @example
 * ```ts
 * try {
 *   await client.authorize("invalid-handle");
 * } catch (error) {
 *   if (error instanceof OAuthError) {
 *     console.log("OAuth operation failed:", error.message);
 *     if (error.cause) {
 *       console.log("Underlying cause:", error.cause.message);
 *     }
 *   }
 * }
 * ```
 */
export class OAuthError extends Error {
  /** Optional underlying error that caused this OAuth error */
  public readonly cause?: Error;

  /**
   * Create a new OAuth error.
   *
   * @param message - Error message describing what went wrong
   * @param cause - Optional underlying error that caused this OAuth error
   */
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "OAuthError";
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Thrown when an AT Protocol handle has invalid format.
 *
 * AT Protocol handles must follow specific formatting rules. This error
 * is thrown when a handle doesn't match the expected format.
 *
 * @example
 * ```ts
 * try {
 *   await client.authorize("invalid-handle-format!!!");
 * } catch (error) {
 *   if (error instanceof InvalidHandleError) {
 *     console.log("Please provide a valid handle like 'alice.bsky.social'");
 *   }
 * }
 * ```
 */
export class InvalidHandleError extends OAuthError {
  /**
   * Create a new invalid handle error.
   *
   * @param handle - The invalid handle that was provided
   */
  constructor(handle: string) {
    super(`Invalid AT Protocol handle: ${handle}`);
    this.name = "InvalidHandleError";
  }
}

/**
 * Thrown when a handle cannot be resolved to a DID and PDS URL.
 *
 * This error occurs during the handle resolution process when the handle
 * cannot be found in the AT Protocol directory or when the resolution
 * service is unavailable.
 *
 * @example
 * ```ts
 * try {
 *   await client.authorize("nonexistent.handle.social");
 * } catch (error) {
 *   if (error instanceof HandleResolutionError) {
 *     console.log("Handle not found or resolution service unavailable");
 *   }
 * }
 * ```
 */
export class HandleResolutionError extends OAuthError {
  /**
   * Create a new handle resolution error.
   *
   * @param handle - The handle that failed to resolve
   * @param cause - Optional underlying error that caused the resolution failure
   */
  constructor(handle: string, cause?: Error) {
    super(`Failed to resolve handle ${handle} to DID and PDS`, cause);
    this.name = "HandleResolutionError";
  }
}

/**
 * Thrown when OAuth endpoints cannot be discovered from a PDS.
 *
 * This error occurs when the PDS doesn't expose the required OAuth
 * configuration endpoints or when the endpoints are malformed.
 *
 * @example
 * ```ts
 * try {
 *   await client.authorize("user.custom-pds.com");
 * } catch (error) {
 *   if (error instanceof PDSDiscoveryError) {
 *     console.log("PDS doesn't support OAuth or endpoints are unavailable");
 *   }
 * }
 * ```
 */
export class PDSDiscoveryError extends OAuthError {
  /**
   * Create a new PDS discovery error.
   *
   * @param pdsUrl - The PDS URL where discovery failed
   * @param cause - Optional underlying error that caused the discovery failure
   */
  constructor(pdsUrl: string, cause?: Error) {
    super(`Failed to discover OAuth endpoints for PDS: ${pdsUrl}`, cause);
    this.name = "PDSDiscoveryError";
  }
}

/**
 * Thrown when the authentication server cannot be discovered from a PDS.
 *
 * This error typically occurs with custom domain setups where the OAuth
 * authorization server is separate from the PDS. It indicates that the
 * authentication server URL couldn't be determined from the PDS configuration.
 *
 * @example
 * ```ts
 * try {
 *   await client.authorize("user.custom-domain.com");
 * } catch (error) {
 *   if (error instanceof AuthServerDiscoveryError) {
 *     console.log("Custom domain OAuth setup may be misconfigured");
 *   }
 * }
 * ```
 */
export class AuthServerDiscoveryError extends OAuthError {
  /**
   * Create a new auth server discovery error.
   *
   * @param pdsUrl - The PDS URL where auth server discovery failed
   * @param cause - Optional underlying error that caused the discovery failure
   */
  constructor(pdsUrl: string, cause?: Error) {
    super(
      `Failed to discover authentication server from PDS: ${pdsUrl}. This may be a custom domain setup issue.`,
      cause,
    );
    this.name = "AuthServerDiscoveryError";
  }
}

/**
 * Thrown when OAuth token exchange operations fail.
 *
 * This error occurs during authorization code exchange or token refresh
 * operations when the OAuth server rejects the request or returns an error.
 *
 * @example
 * ```ts
 * try {
 *   const { session } = await client.callback(params);
 * } catch (error) {
 *   if (error instanceof TokenExchangeError) {
 *     console.log("Token exchange failed:", error.message);
 *     if (error.errorCode) {
 *       console.log("OAuth error code:", error.errorCode);
 *     }
 *     if (error.errorDescription) {
 *       console.log("OAuth error description:", error.errorDescription);
 *     }
 *   }
 * }
 * ```
 */
export class TokenExchangeError extends OAuthError {
  /** OAuth error code from the server (e.g., "invalid_grant") */
  public readonly errorCode?: string;

  /** OAuth error_description from the server (e.g., "Refresh token replayed") */
  public readonly errorDescription?: string;

  /**
   * Create a new token exchange error.
   *
   * @param message - Error message describing what went wrong
   * @param errorCode - Optional OAuth error code from the server
   * @param cause - Optional underlying error that caused the token exchange failure
   * @param errorDescription - Optional OAuth error_description from the server
   */
  constructor(message: string, errorCode?: string, cause?: Error, errorDescription?: string) {
    super(`Token exchange failed: ${message}`, cause);
    this.name = "TokenExchangeError";
    if (errorCode) {
      this.errorCode = errorCode;
    }
    if (errorDescription) {
      this.errorDescription = errorDescription;
    }
  }
}

/**
 * Thrown when DPoP (Demonstration of Proof-of-Possession) operations fail.
 *
 * DPoP is used for secure token binding in OAuth flows. This error occurs
 * when DPoP key generation, proof creation, or validation fails.
 *
 * @example
 * ```ts
 * try {
 *   await session.makeRequest("GET", "/xrpc/endpoint");
 * } catch (error) {
 *   if (error instanceof DPoPError) {
 *     console.log("DPoP authentication failed:", error.message);
 *   }
 * }
 * ```
 */
export class DPoPError extends OAuthError {
  /**
   * Create a new DPoP error.
   *
   * @param message - Error message describing the DPoP operation failure
   * @param cause - Optional underlying error that caused the DPoP failure
   */
  constructor(message: string, cause?: Error) {
    super(`DPoP operation failed: ${message}`, cause);
    this.name = "DPoPError";
  }
}

/**
 * Thrown when session operations encounter errors.
 *
 * This error occurs during session management operations like token refresh,
 * request signing, or session restoration when the session state is invalid
 * or operations fail.
 *
 * @example
 * ```ts
 * try {
 *   const session = await client.restore("session-id");
 *   await session.makeRequest("GET", "/api/endpoint");
 * } catch (error) {
 *   if (error instanceof SessionError) {
 *     console.log("Session operation failed:", error.message);
 *   }
 * }
 * ```
 */
export class SessionError extends OAuthError {
  /**
   * Create a new session error.
   *
   * @param message - Error message describing the session operation failure
   * @param cause - Optional underlying error that caused the session failure
   */
  constructor(message: string, cause?: Error) {
    super(`Session error: ${message}`, cause);
    this.name = "SessionError";
  }
}

/**
 * Thrown when the OAuth state parameter is invalid or expired.
 *
 * The state parameter is used for CSRF protection in OAuth flows. This error
 * occurs when the state parameter in the callback doesn't match the expected
 * value or has expired.
 *
 * @example
 * ```ts
 * try {
 *   const { session } = await client.callback(params);
 * } catch (error) {
 *   if (error instanceof InvalidStateError) {
 *     console.log("OAuth state validation failed - possible CSRF attack");
 *   }
 * }
 * ```
 */
export class InvalidStateError extends OAuthError {
  /**
   * Create a new invalid state error.
   */
  constructor() {
    super("Invalid or expired OAuth state parameter");
    this.name = "InvalidStateError";
  }
}

/**
 * Thrown when OAuth authorization fails at the authorization server.
 *
 * This error occurs when the authorization server returns an error during
 * the OAuth flow, typically due to user denial, invalid client configuration,
 * or server-side issues.
 *
 * @example
 * ```ts
 * try {
 *   const { session } = await client.callback(params);
 * } catch (error) {
 *   if (error instanceof AuthorizationError) {
 *     console.log("Authorization was denied or failed:", error.message);
 *   }
 * }
 * ```
 */
export class AuthorizationError extends OAuthError {
  /**
   * Create a new authorization error.
   *
   * @param error - OAuth error code from the authorization server
   * @param description - Optional human-readable error description
   */
  constructor(error: string, description?: string) {
    super(`Authorization failed: ${error}${description ? ` - ${description}` : ""}`);
    this.name = "AuthorizationError";
  }
}

/**
 * Thrown when a session cannot be found in storage.
 *
 * This error occurs during session restoration when the requested session
 * ID does not exist in storage, indicating the user needs to re-authenticate.
 *
 * @example
 * ```ts
 * try {
 *   const session = await client.restore("unknown-session-id");
 * } catch (error) {
 *   if (error instanceof SessionNotFoundError) {
 *     console.log("Session expired or doesn't exist - please log in again");
 *   }
 * }
 * ```
 */
export class SessionNotFoundError extends SessionError {
  /**
   * Create a new session not found error.
   *
   * @param sessionId - The session ID that was not found
   */
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

/**
 * Thrown when a refresh token has expired and cannot be used.
 *
 * Refresh tokens have a limited lifetime. This error occurs when attempting
 * to use an expired refresh token, requiring the user to re-authenticate.
 *
 * @example
 * ```ts
 * try {
 *   const session = await client.restore("session-id");
 * } catch (error) {
 *   if (error instanceof RefreshTokenExpiredError) {
 *     console.log("Refresh token expired - please log in again");
 *   }
 * }
 * ```
 */
export class RefreshTokenExpiredError extends TokenExchangeError {
  /**
   * Create a new refresh token expired error.
   *
   * @param cause - Optional underlying error from the token endpoint
   */
  constructor(cause?: Error) {
    super("Refresh token has expired", "invalid_grant", cause);
    this.name = "RefreshTokenExpiredError";
  }
}

/**
 * Thrown when a refresh token has been revoked by the authorization server.
 *
 * This error occurs when attempting to use a refresh token that has been
 * explicitly revoked, requiring the user to re-authenticate.
 *
 * @example
 * ```ts
 * try {
 *   const session = await client.restore("session-id");
 * } catch (error) {
 *   if (error instanceof RefreshTokenRevokedError) {
 *     console.log("Access has been revoked - please log in again");
 *   }
 * }
 * ```
 */
export class RefreshTokenRevokedError extends TokenExchangeError {
  /**
   * Create a new refresh token revoked error.
   *
   * @param cause - Optional underlying error from the token endpoint
   */
  constructor(cause?: Error) {
    super("Refresh token has been revoked", "invalid_grant", cause);
    this.name = "RefreshTokenRevokedError";
  }
}

/**
 * Thrown when network operations fail during OAuth operations.
 *
 * This error indicates a transient network failure that may be retryable,
 * such as connection timeouts, DNS failures, or network unavailability.
 *
 * @example
 * ```ts
 * try {
 *   const session = await client.restore("session-id");
 * } catch (error) {
 *   if (error instanceof NetworkError) {
 *     console.log("Network error - retrying may help:", error.message);
 *   }
 * }
 * ```
 */
export class NetworkError extends OAuthError {
  /**
   * Create a new network error.
   *
   * @param message - Error message describing the network failure
   * @param cause - Optional underlying error from the network operation
   */
  constructor(message: string, cause?: Error) {
    super(`Network error: ${message}`, cause);
    this.name = "NetworkError";
  }
}

/**
 * Thrown when authorization server metadata fails validation.
 *
 * This error occurs when the metadata from an OAuth authorization server
 * is missing required fields, has invalid values, or doesn't meet
 * AT Protocol requirements.
 */
export class MetadataValidationError extends OAuthError {
  constructor(message: string, cause?: Error) {
    super(`Invalid auth server metadata: ${message}`, cause);
    this.name = "MetadataValidationError";
  }
}

/**
 * Thrown when the issuer in a token response doesn't match the expected
 * authorization server. This is a critical security check that prevents
 * a malicious auth server from issuing tokens for a different user.
 */
export class IssuerMismatchError extends OAuthError {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Issuer mismatch: expected "${expected}" but got "${actual}". ` +
        `The authorization server is not authoritative for this identity.`,
    );
    this.name = "IssuerMismatchError";
  }
}

/**
 * Thrown when a token response fails validation.
 *
 * This error occurs when the token response from the authorization server
 * is missing required fields or contains invalid values.
 */
export class TokenValidationError extends TokenExchangeError {
  constructor(message: string, cause?: Error) {
    super(`Invalid token response: ${message}`, undefined, cause);
    this.name = "TokenValidationError";
  }
}
