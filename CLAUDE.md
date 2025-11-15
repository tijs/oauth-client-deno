# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Deno-native AT Protocol OAuth client library that provides handle-focused authentication using Web Crypto API. It's an alternative to `@atproto/oauth-client-node` built specifically to solve Node.js crypto compatibility issues in Deno environments.

**Key Design Philosophy:**
- Handle-focused (accepts `alice.bsky.social` only, not DIDs or URLs)
- Uses Slingshot resolver by default with multiple fallbacks
- Web Crypto API for cross-platform compatibility (no Node.js crypto)
- DPoP (Demonstrating Proof of Possession) authentication with ES256 keys

## Development Commands

```bash
# Run all tests with required permissions
deno test --allow-net --allow-read

# Run a specific test file
deno test --allow-net --allow-read tests/session_test.ts

# Type checking
deno check mod.ts
deno check **/*.ts

# Format code
deno fmt              # check formatting
deno fmt --check      # verify formatting
deno fmt <file>       # format specific file

# Lint code
deno lint

# Run full CI suite (format, lint, check, test)
deno task ci
```

## Architecture

### Core Components

1. **OAuthClient** (`src/client.ts`) - Main OAuth flow orchestration
   - Handles authorization URL generation with PKCE
   - Token exchange and refresh with DPoP
   - Pushed Authorization Request (PAR) support
   - Concurrency-safe token refresh with per-session locks

2. **Session** (`src/session.ts`) - Authenticated session management
   - Token lifecycle management (access + refresh tokens)
   - DPoP-authenticated request handling with automatic nonce retry
   - 5-minute expiration buffer for token refresh
   - Serializable session state

3. **Handle Resolvers** (`src/resolvers.ts`) - AT Protocol handle resolution
   - `SlingshotResolver` (default): Slingshot → Bluesky API → direct lookup fallback chain
   - `DirectoryResolver`: Bluesky API only
   - `CustomResolver`: User-provided resolution function
   - OAuth endpoint discovery from PDS metadata

4. **DPoP** (`src/dpop.ts`) - Proof of Possession implementation
   - ES256 (ECDSA P-256) key generation using Web Crypto API
   - JWT proof generation with `jsr:@panva/jose` (not npm version)
   - Automatic nonce handling on 401 challenges

5. **Storage** (`src/storage.ts`) - Session persistence abstractions
   - `MemoryStorage`: In-memory with TTL support
   - `SQLiteStorage`: Deno SQLite backend example
   - `LocalStorage`: Browser/localStorage compatible
   - All storage is async with TTL support

6. **Error Handling** (`src/errors.ts`) - Typed error hierarchy
   - All errors extend `OAuthError` base class
   - Specific error types for each failure mode
   - Error chaining with `cause` support

### Critical Implementation Details

**Web Crypto API Usage:**
- MUST use `crypto.subtle.generateKey()` with `{ name: "ECDSA", namedCurve: "P-256" }`
- NEVER use Node.js crypto APIs - they don't work in Deno
- Import jose from `jsr:@panva/jose` NOT `npm:jose`

**DPoP Authentication:**
- Every token request requires DPoP proof with ES256 signature
- Access token hash (`ath` claim) required for authenticated requests
- Servers may respond with 400/401 + `DPoP-Nonce` header requiring retry

**Concurrency Safety:**
- `OAuthClient.restore()` uses `refreshLocks` Map to prevent duplicate refresh requests
- Multiple concurrent restore calls for same session wait on single refresh operation

**Token Refresh:**
- Sessions considered expired if token expires within 5 minutes
- Refresh may or may not rotate refresh token (server-dependent)
- Refresh failures throw typed errors: `RefreshTokenExpiredError`, `NetworkError`, etc.

## Testing

- All tests use `Deno.test()` with nested `t.step()` for organization
- Use `jsr:@std/assert@1` for assertions
- Tests require `--allow-net` for resolver/OAuth endpoint tests
- Tests are isolated - use helper functions like `createTestSessionData()`
- NO mocking of external services - tests use real AT Protocol endpoints

## Security Considerations

- OAuth state validation prevents CSRF attacks (10-minute TTL on PKCE data)
- PKCE flow protects against authorization code interception
- DPoP binds tokens to specific key pairs
- No credentials should ever be committed to the repository

## Publishing

- Package published to JSR (not npm)
- Version in `deno.json` must be updated before publishing
- Run `deno publish` from repository root
- See `CHANGELOG.md` for version history

## Common Tasks

**Adding a new error type:**
1. Create class extending appropriate base in `src/errors.ts`
2. Add JSDoc with `@example` showing usage
3. Export from `mod.ts`
4. Add test case in `tests/errors_test.ts`

**Adding a new storage backend:**
1. Implement `OAuthStorage` interface in `src/storage.ts`
2. Handle TTL and expiration logic
3. Export from `mod.ts`
4. Add test coverage in `tests/storage_test.ts`

**Modifying OAuth flow:**
- Changes to `client.ts` likely require testing against real AT Protocol servers
- Ensure PKCE data cleanup happens even on errors
- Maintain per-session refresh lock semantics
