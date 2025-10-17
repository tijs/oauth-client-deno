# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Deno-compatible AT Protocol OAuth client built specifically for handle-based authentication. This is **NOT a drop-in replacement** for `@atproto/oauth-client-node` - it's an opinionated, handle-focused alternative built on Web Crypto API.

**Key Design Decisions:**

- Handle-only inputs (e.g., `alice.bsky.social`) - no DIDs or URLs accepted
- Slingshot resolver as default with fallbacks (Bluesky API → direct resolution)
- Web Crypto API exclusively for cross-platform compatibility
- Built for Deno runtime, not Node.js

## Commands

### Development

```bash
# Type checking
deno task check

# Format code
deno task fmt         # Check formatting
deno task fmt:fix     # Auto-fix formatting

# Linting
deno task lint

# Run all checks (CI simulation)
deno task ci
```

### Testing

```bash
# Run all tests
deno task test

# Run specific test file
deno test tests/session_test.ts --allow-net --allow-read

# Run tests with coverage
deno test --coverage=coverage --allow-net --allow-read
```

### Publishing

```bash
# Publish to JSR (requires proper version in deno.json)
deno publish
```

## Architecture

### Core Flow: OAuth Authorization

1. **Handle Resolution** (`src/resolvers.ts`)
   - `SlingshotResolver` (default): Uses Slingshot's `resolveMiniDoc` endpoint for fast DID+PDS lookup
   - Fallback chain: Slingshot standard → Bluesky API → Direct `.well-known/atproto-did` lookup
   - `DirectoryResolver`: Bluesky API only (no Slingshot)
   - `CustomResolver`: User-provided resolution logic

2. **OAuth Endpoint Discovery** (`src/resolvers.ts`)
   - Discover auth server from PDS: `/.well-known/oauth-protected-resource`
   - Discover OAuth endpoints from auth server: `/.well-known/oauth-authorization-server`
   - Fallback: Try PDS directly if auth server discovery fails

3. **Authorization Flow** (`src/client.ts`)
   - Generate PKCE parameters (code_verifier, code_challenge)
   - Store PKCE data in storage with 10-minute TTL (`pkce:{state}`)
   - Push Authorization Request (PAR) to get request_uri
   - Return authorization URL for user redirect

4. **Token Exchange** (`src/client.ts`)
   - Validate state parameter and retrieve PKCE data
   - Generate DPoP ES256 key pair (Web Crypto API)
   - Exchange authorization code for tokens with DPoP proof
   - Handle DPoP nonce challenges (retry with nonce on 400 status)
   - Create and return authenticated session

5. **DPoP Authentication** (`src/dpop.ts`)
   - ES256 (ECDSA P-256) key generation using Web Crypto API
   - JWT creation with `jsr:@panva/jose` (NOT npm:jose)
   - DPoP proof includes: jti, htm, htu, iat, exp, optional ath (access token hash), optional nonce
   - Automatic nonce handling: retry on 401 with `DPoP-Nonce` header

### Key Components

**`OAuthClient` (src/client.ts)**

- Main entry point for OAuth operations
- Methods: `authorize()`, `callback()`, `store()`, `restore()`, `refresh()`, `signOut()`
- Manages PKCE flow, token exchange, and session lifecycle

**`Session` (src/session.ts)**

- Represents authenticated user session
- Properties: `did`, `handle`, `pdsUrl`, `accessToken`, `refreshToken`, `isExpired`
- `makeRequest()`: Makes DPoP-authenticated HTTP requests with automatic nonce handling
- Serializable via `toJSON()` / `fromJSON()` for storage

**Storage Implementations (src/storage.ts)**

- `MemoryStorage`: In-memory with TTL support (development/testing)
- `SQLiteStorage`: Example SQLite backend (reference implementation)
- `LocalStorage`: Browser localStorage wrapper
- All implement `OAuthStorage` interface: `get()`, `set()`, `delete()`

**Error Hierarchy (src/errors.ts)**

- Base: `OAuthError` (all OAuth errors inherit from this)
- Handle errors: `InvalidHandleError`, `HandleResolutionError`
- Discovery errors: `PDSDiscoveryError`, `AuthServerDiscoveryError`
- Flow errors: `TokenExchangeError`, `AuthorizationError`, `InvalidStateError`
- Auth errors: `DPoPError`, `SessionError`

### Critical Implementation Details

**Web Crypto API vs Node.js crypto**

- MUST use `crypto.subtle.generateKey()` with explicit `namedCurve: "P-256"`
- MUST use `jsr:@panva/jose` NOT `npm:jose` or Node.js jose packages
- DPoP key generation MUST set `extractable: true` for JWK export
- Private key import MUST clean JWK (remove conflicting `key_ops` from exportJWK)

**DPoP Nonce Handling**

- AT Protocol uses 400 status (not 401) for initial nonce challenges during token exchange
- Token refresh uses 401 status for nonce challenges
- Always check `DPoP-Nonce` header and retry with nonce if present
- Nonce included in JWT payload, not header

**Handle Resolution Strategy**

- Default: Slingshot with multi-level fallbacks
- `resolveMiniDoc` returns both DID + PDS in one request (preferred)
- Standard resolution requires two requests: handle→DID, then DID document→PDS
- PDS URL extracted from DID document's `AtprotoPersonalDataServer` service

**Session Storage Pattern**

- PKCE data stored with `pkce:{state}` prefix, 10-minute TTL
- Sessions stored with `session:{sessionId}` prefix
- Auto-refresh on restore if token expires within 5 minutes
- `isExpired` uses 5-minute buffer to prevent edge cases

## Testing Patterns

Tests use Deno's built-in test framework with the following patterns:

**Mock/Fake Pattern** (per user's global CLAUDE.md)

- Tests must NOT rely on external services
- Use injection patterns for all dependencies
- Mock storage, resolvers, and network calls in tests
- Test files: `tests/*_test.ts`

**Test File Structure**

- `errors_test.ts`: Error class behavior and messages
- `session_test.ts`: Session management, token refresh, serialization
- `storage_test.ts`: Storage implementations with TTL
- `utils_test.ts`: Utility functions (PKCE, DPoP, etc.)

## Security & OAuth Best Practices

**CRITICAL: No OAuth Workarounds** (per user's global CLAUDE.md)

- Always follow OAuth 2.0, AT Protocol, and DPoP specs exactly
- No shortcuts or "good enough" solutions for auth flows
- Properly validate state parameters (CSRF protection)
- Use secure PKCE (S256, not plain)
- DPoP proof must include all required claims

**Token Management**

- Store refresh tokens securely in storage backend
- Never log tokens or sensitive cryptographic material
- Clean up PKCE data after use (success or failure)
- Revoke tokens on sign out (best effort)

## Common Development Patterns

**Adding a new storage backend:**

1. Implement `OAuthStorage` interface from `src/types.ts`
2. Implement `get<T>()`, `set<T>()`, `delete()` with TTL support
3. Handle TTL expiration in `get()` (return null if expired)
4. Add tests following pattern in `tests/storage_test.ts`

**Adding a new resolver:**

1. Implement `HandleResolver` interface from `src/types.ts`
2. Implement `resolve(handle)` returning `{ did: string; pdsUrl: string }`
3. Throw `HandleResolutionError` on failure
4. Consider fallback mechanisms like `SlingshotResolver`

**Error handling:**

- Catch and re-throw with appropriate error class
- Preserve error cause chain for debugging
- All OAuth errors extend `OAuthError` base class
- Use specific error types for different failure modes

## Important Constraints

- **Handle-only inputs**: Client only accepts AT Protocol handles, not DIDs or URLs
- **Deno runtime**: Built for Deno, uses Web Standards APIs exclusively
- **No Node.js crypto**: Cannot use Node.js crypto modules (incompatible with Deno)
- **Slingshot dependency**: Default resolver uses third-party Slingshot service (can be configured)
- **ES256 only**: DPoP uses ECDSA P-256 (ES256), not RS256 or other algorithms
