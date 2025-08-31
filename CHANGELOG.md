# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
