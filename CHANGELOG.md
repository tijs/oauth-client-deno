# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.1] - 2026-02-15

### Added

- **Identity on IssuerMismatchError**: `handle` and `did` properties are now
  set on `IssuerMismatchError` when thrown from `callback()`, allowing callers
  to re-authorize through the correct auth server transparently.

## [5.0.0] - 2026-02-15

### Breaking

- **Token response validation**: `callback()` now validates the full token
  response from the auth server (access_token, token_type=DPoP, sub=did:*,
  scope contains atproto, expires_in > 0). Previously invalid responses
  would silently create broken sessions.
- **Auth server metadata validation**: `discoverOAuthEndpointsFromAuthServer()`
  now returns an `issuer` field and validates metadata against the AT Protocol
  OAuth spec (issuer match, HTTPS endpoints, DPoP ES256 support).

### Added

- **Issuer verification after token exchange** (critical security fix): After
  exchanging the authorization code, the client now resolves the DID's PDS to
  verify the auth server is authoritative for that identity. Prevents a
  malicious auth server from issuing tokens claiming to be another user.
- **`iss` parameter validation** (RFC 9207): The callback now validates the
  `iss` query parameter when present, rejecting mismatched issuers.
- **JARM detection**: The callback rejects JWT-encoded authorization responses
  (`response` parameter) with a clear error.
- **DPoP `htu` normalization** (RFC 9449): Query parameters and fragments are
  now stripped from the `htu` claim in DPoP proofs.
- **DPoP nonce caching**: Nonces are cached per-origin so the first request
  to a server that requires nonces doesn't need a retry.
- **Auto-retry on 401**: Sessions now automatically refresh tokens and retry
  when a request returns 401 Unauthorized.
- **Refresh timeout**: Token refresh operations now have a configurable timeout
  (default 30s) via `refreshTimeout` config option.
- **Token revocation on refresh failure**: When a non-recoverable refresh
  error occurs, the old refresh token is revoked (best effort).
- **Event callbacks**: `onSessionUpdated` and `onSessionDeleted` config
  options for reacting to session lifecycle events.
- **Custom distributed locking**: `requestLock` config option for Redis-based
  or other distributed refresh token locking.
- **HTTPS enforcement**: All discovered OAuth endpoints are validated to use
  HTTPS.
- **New error types**: `MetadataValidationError`, `IssuerMismatchError`,
  `TokenValidationError` for precise error handling.
- **Validation exports**: `validateAuthServerMetadata()` and
  `validateTokenResponse()` are exported for use by consumers.
- **Upstream attribution**: LICENSE, NOTICE, and README now explicitly credit
  the Bluesky AT Protocol libraries.

## [4.1.0] - 2026-02-15

### Added

- **Authorization server URL support in `authorize()`**: The `authorize` method
  now accepts authorization server URLs (e.g., `https://bsky.social`) in addition
  to AT Protocol handles. When a URL is provided, handle resolution is skipped
  and OAuth endpoints are discovered directly from the server. This enables
  "Connect with Bluesky" flows that redirect users to a specific auth server
  without requiring handle entry.

## [4.0.2] - 2025-11-27

### Fixed

- **Token refresh race condition in serverless environments**: When concurrent requests
  trigger token refresh simultaneously across different isolates (e.g., Val Town, Deno Deploy),
  the second request would fail with "Refresh token replayed" error. Now gracefully handles
  this by re-reading the session from storage after detecting the replay error.

### Added

- **`errorDescription` field on `TokenExchangeError`**: OAuth `error_description` is now
  exposed as a separate field for better error handling and logging
- **OAuth error response parsing**: Token exchange errors now properly parse JSON error
  responses from OAuth servers, extracting `error` and `error_description` fields

### Improved

- Better error classification for token refresh failures
- More informative error messages when OAuth operations fail

## [4.0.1] - 2025-01-15

### Fixed

- Use exact versions in import map instead of semver ranges for better reproducibility
  - `@panva/jose`: `^6.1.0` → `6.1.0`
  - `@std/assert`: `1` → `1.0.13`

## [4.0.0] - 2025-01-15

### Breaking Changes

- **`restore()` now throws errors instead of returning null**
  - Use try/catch to handle `SessionNotFoundError`, `RefreshTokenExpiredError`, `NetworkError`
  - More explicit error handling with typed error classes
  - See migration guide below for update instructions

### Added

- **Logging System**: Configurable logging abstraction
  - `Logger` interface for custom logging implementations
  - `NoOpLogger` (default, silent)
  - `ConsoleLogger` for development/debugging
  - Inject via `OAuthClientConfig.logger`
- **New Modules**: Better code organization
  - `src/pkce.ts`: PKCE utilities (code verifier, challenge, base64url)
  - `src/token-exchange.ts`: Token exchange and refresh operations
  - `src/logger.ts`: Logging abstractions
- **Concurrency Protection**: Dual locking system
  - `restoreLocks` for session restoration (prevents duplicate restore operations)
  - `refreshLocks` for token refresh (prevents duplicate token requests)
  - Concurrent calls wait on single operation and share results

### Improved

- **Type Safety**: Removed all type assertions
  - Added runtime validation in `dpop.ts` for JWK imports
  - Added type guards in `storage.ts` for SQLite results
  - Proper type narrowing throughout codebase
- **Code Deduplication**: Shared DPoP retry logic
  - Single `fetchWithDPoPRetry` utility handles nonce challenges
  - Eliminates duplicate code in token exchange and refresh
- **File Organization**: All files now under 700 lines
  - `client.ts`: 731 → 683 lines
  - Better separation of concerns across modules

### Removed

- **Unused API Parameters**:
  - Removed `signal?: AbortSignal` from `AuthorizeOptions` (not implemented)
  - Removed `CallbackOptions` interface and parameter (unused)
- **Console Logging**: All console.* calls replaced with Logger interface

### Migration Guide

**Update restore() error handling:**

```typescript
// Before (v3.x):
const session = await client.restore("session-id");
if (!session) {
  console.log("Session not found");
}

// After (v4.x):
try {
  const session = await client.restore("session-id");
  console.log("Welcome back,", session.handle);
} catch (error) {
  if (error instanceof SessionNotFoundError) {
    console.log("Please log in again");
  } else if (error instanceof RefreshTokenExpiredError) {
    console.log("Session expired, please re-authenticate");
  } else {
    throw error;
  }
}
```

**Add logging (optional):**

```typescript
import { ConsoleLogger } from "@tijs/oauth-client-deno";

const client = new OAuthClient({
  // ... other config
  logger: new ConsoleLogger(), // Enable debug logging
});
```

## [3.0.0] - 2025-01-11

### Changed

- **BREAKING**: `restore()` method now throws typed errors instead of returning `null` on failure
  - Throws `SessionNotFoundError` when session doesn't exist in storage
  - Throws `RefreshTokenExpiredError` when refresh token has expired
  - Throws `RefreshTokenRevokedError` when refresh token has been revoked
  - Throws `NetworkError` for transient network failures
  - Throws `TokenExchangeError` for other token refresh failures
  - Throws `SessionError` for unexpected session restoration failures

### Added

- **New Error Types**: Added specific error classes for better error handling and debugging
  - `SessionNotFoundError`: Session not found in storage
  - `RefreshTokenExpiredError`: Refresh token has expired
  - `RefreshTokenRevokedError`: Refresh token has been revoked
  - `NetworkError`: Network-related failures (retryable)
- **Detailed Error Logging**: Added comprehensive logging throughout session restoration and token refresh flows
  - Logs session lookup attempts
  - Logs token refresh operations
  - Logs all error conditions with context

### Improved

- **Error Visibility**: Session restoration failures now provide detailed error information instead of silent null returns
- **Error Classification**: Automatic classification of token exchange errors into specific error types
- **Debugging**: Enhanced logging makes it easier to diagnose OAuth session issues in production

### Migration Guide

Applications using `restore()` must now handle errors instead of checking for `null`:

**Before (v2.x):**

```typescript
const session = await client.restore("session-id");
if (!session) {
  // Handle failure - but why did it fail?
  console.log("Session not found");
}
```

**After (v3.x):**

```typescript
try {
  const session = await client.restore("session-id");
  // Use session
} catch (error) {
  if (error instanceof SessionNotFoundError) {
    // User needs to log in again
  } else if (error instanceof RefreshTokenExpiredError) {
    // Refresh token expired - re-authenticate required
  } else if (error instanceof NetworkError) {
    // Temporary network issue - retry may help
  }
}
```

## [2.1.0] - 2025-01-17

### Added

- **Concurrency-Safe Session Restore**: Added per-session lock manager to prevent race conditions when multiple concurrent requests try to restore the same session
  - Prevents duplicate token refresh requests when session expires
  - Concurrent requests for the same session now wait for and share the result of the first refresh operation
  - Locks are per-DID, so different users' sessions are not affected by each other
  - Automatic lock cleanup when restore operation completes
  - Zero breaking changes - completely internal implementation detail

### Fixed

- **Race Condition in Token Refresh**: Fixed issue where concurrent API requests during session expiry could cause "OAuth session not found" errors
  - Multiple endpoints calling `restore()` simultaneously would all trigger refresh, causing race conditions
  - Now only one refresh happens per session even if 10+ endpoints call `restore()` concurrently
  - Resolves intermittent 503 errors in multi-endpoint applications

### Improved

- **Developer Experience**: Enhanced JSDoc documentation for `restore()` method to clarify concurrency-safe behavior

## [2.0.0] - 2025-09-17

### Changed

- **BREAKING**: Added required `pdsUrl` property to `OAuthSession` interface for consistency with hono-oauth-sessions v0.3.0
- Enhanced type compatibility with updated AT Protocol OAuth ecosystem

## [1.0.5] - 2025-09-07

### Fixed

- **DPoP Private Key Import**: Corrected key usage flags for private key import to use only `["sign"]` instead of `["sign", "verify"]`, matching Web Crypto API requirements for ECDSA private keys
- Fixed persistent "Invalid key usage" error in DPoP authentication

## [1.0.4] - 2025-09-07

### Fixed

- **DPoP Key Import Issue**: Fixed "Invalid key usage" error by cleaning JWK before import to remove conflicting key_ops fields that may be added by the jose library's exportJWK function
- Improved compatibility with Web Crypto API strict key usage validation

## [1.0.3] - 2025-09-07

### Fixed

- **DPoP Key Generation/Import Alignment**: Fixed key usage flags mismatch between generation and import operations
- Updated import function to use `["sign", "verify"]` to match generation flags
- Added complete session data storage support for hono-oauth-sessions integration

## [1.0.2] - 2025-09-07

### Fixed

- **Interface Compatibility**: Added `toJSON()` method to `OAuthSession` interface for hono-oauth-sessions compatibility
- Enhanced session serialization support for complete OAuth data persistence

## [1.0.1] - 2025-09-05

### Added

- **Comprehensive JSDoc Documentation**: Added detailed JSDoc comments to all public symbols including:
  - Complete error class documentation with examples and use cases
  - Enhanced resolver class documentation with usage patterns
  - Detailed function documentation for all exported utilities
  - Improved client method documentation with comprehensive examples
- **JSR Documentation Compliance**: Updated all documentation to follow JSR best practices for symbol documentation

### Improved

- **Developer Experience**: All public APIs now have rich documentation with examples
- **IDE Support**: Enhanced IntelliSense and auto-completion with detailed parameter descriptions
- **Error Handling**: Clear documentation for all error types and when they are thrown

## [1.0.0] - 2025-08-31

### Changed

- **BREAKING: API Interface Updates**: Updated method signatures to better align with @atproto/oauth-client patterns
  - `authorize()` now returns `URL` object instead of string
  - `callback()` now accepts `URLSearchParams` instead of object with string properties
  - `callback()` now returns `{ session: OAuthSession; state: string | null }` format
  - Session now implements `OAuthSession` interface with `sub` and `aud` properties
  - Added `AuthorizeOptions` and `CallbackOptions` interfaces matching @atproto patterns

### Added

- **Documentation Improvements**: Consolidated README with clear "Opinionated Design" section
  - Clarified that this is NOT a drop-in replacement for @atproto/oauth-client-node
  - Emphasized handle-focused design and Deno-first approach
  - Simplified comparison table and removed repetitive messaging
- **Bun Compatibility**: Confirmed Web Crypto API compatibility with Bun runtime
  - All core functionality works with Bun when using npm dependencies instead of JSR

### Technical Notes

- While interface signatures now align better with @atproto patterns, this client remains handle-focused
- Accepts AT Protocol handles only (not DIDs or URLs like @atproto/oauth-client-node)
- Built for Deno environments with Web Crypto API, not Node.js

## [0.1.2] - 2025-08-31

### Fixed

- **DPoP Nonce Handling**: Fixed HTTP status code handling for DPoP nonce errors to comply with RFC 9449
  - Authorization server DPoP nonce errors now correctly check for HTTP 400 status (was incorrectly checking 401)
  - Resource server DPoP nonce errors continue to use HTTP 401 status as per specification
  - This resolves `"use_dpop_nonce"` errors when authenticating with AT Protocol servers
- **OAuth Discovery**: Fixed authentication server discovery endpoint path
  - Changed from incorrect `/.well-known/atproto-did` to correct `/.well-known/oauth-protected-resource`
  - Ensures proper OAuth server endpoint discovery for custom domains and personal PDS instances

### Changed

- Updated token exchange logic to be more robust with proper error status code detection
- Improved error messages for DPoP nonce-related authentication failures

## [0.1.1] - 2025-08-31

### Added

- Version bump for JSR compatibility testing

## [0.1.0] - 2025-08-31

### Added

- Initial release of AT Protocol OAuth client for Deno
- Full OAuth 2.0 + PKCE implementation for AT Protocol
- DPoP (Demonstrating Proof of Possession) support using Web Crypto API
- Comprehensive handle resolution with Slingshot integration and fallbacks
- Session management with automatic token refresh
- Multiple storage backends:
  - `MemoryStorage` for development and testing
  - `LocalStorage` for browser environments
  - Extensible storage interface for custom implementations
- Complete error handling with specific error types:
  - `OAuthError`, `InvalidHandleError`, `HandleResolutionError`
  - `PDSDiscoveryError`, `TokenExchangeError`, `DPoPError`
  - `SessionError`, `InvalidStateError`, `AuthorizationError`
- Cross-platform compatibility (Deno, browsers, Web Standards environments)
- Comprehensive test suite (25 tests, 74 test steps)
- Full TypeScript support with strict type checking
- API compatibility with `@atproto/oauth-client-node`

#### Key Features

- **Handle Resolution**: Slingshot-first resolution with automatic fallbacks to Bluesky API and direct handle lookup
- **Storage Flexibility**: Built-in storage implementations with TTL support
- **Security**: Full DPoP implementation using ECDSA P-256 keys and Web Crypto API
- **Error Handling**: Comprehensive error types with proper error chaining
- **Session Management**: Automatic token refresh and session persistence
- **Mobile Support**: Custom URL scheme support for mobile app integration

#### Technical Implementation

- Built specifically for Deno runtime using Web Crypto API
- Zero Node.js dependencies - uses `jsr:@panva/jose` for JWT operations
- Implements AT Protocol OAuth specification with full DPoP support
- Uses Web Standards for maximum cross-platform compatibility

[1.0.0]: https://github.com/tijs/oauth-client-deno/releases/tag/v1.0.0
[0.1.2]: https://github.com/tijs/oauth-client-deno/releases/tag/v0.1.2
[0.1.1]: https://github.com/tijs/oauth-client-deno/releases/tag/v0.1.1
[0.1.0]: https://github.com/tijs/oauth-client-deno/releases/tag/v0.1.0
