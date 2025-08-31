/**
 * Custom error classes for OAuth client
 */

export class OAuthError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "OAuthError";
    if (cause) {
      this.cause = cause;
    }
  }
}

export class InvalidHandleError extends OAuthError {
  constructor(handle: string) {
    super(`Invalid AT Protocol handle: ${handle}`);
    this.name = "InvalidHandleError";
  }
}

export class HandleResolutionError extends OAuthError {
  constructor(handle: string, cause?: Error) {
    super(`Failed to resolve handle ${handle} to DID and PDS`, cause);
    this.name = "HandleResolutionError";
  }
}

export class PDSDiscoveryError extends OAuthError {
  constructor(pdsUrl: string, cause?: Error) {
    super(`Failed to discover OAuth endpoints for PDS: ${pdsUrl}`, cause);
    this.name = "PDSDiscoveryError";
  }
}

export class AuthServerDiscoveryError extends OAuthError {
  constructor(pdsUrl: string, cause?: Error) {
    super(
      `Failed to discover authentication server from PDS: ${pdsUrl}. This may be a custom domain setup issue.`,
      cause,
    );
    this.name = "AuthServerDiscoveryError";
  }
}

export class TokenExchangeError extends OAuthError {
  public readonly errorCode?: string;

  constructor(message: string, errorCode?: string, cause?: Error) {
    super(`Token exchange failed: ${message}`, cause);
    this.name = "TokenExchangeError";
    if (errorCode) {
      this.errorCode = errorCode;
    }
  }
}

export class DPoPError extends OAuthError {
  constructor(message: string, cause?: Error) {
    super(`DPoP operation failed: ${message}`, cause);
    this.name = "DPoPError";
  }
}

export class SessionError extends OAuthError {
  constructor(message: string, cause?: Error) {
    super(`Session error: ${message}`, cause);
    this.name = "SessionError";
  }
}

export class InvalidStateError extends OAuthError {
  constructor() {
    super("Invalid or expired OAuth state parameter");
    this.name = "InvalidStateError";
  }
}

export class AuthorizationError extends OAuthError {
  constructor(error: string, description?: string) {
    super(`Authorization failed: ${error}${description ? ` - ${description}` : ""}`);
    this.name = "AuthorizationError";
  }
}
