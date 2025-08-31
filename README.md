# @tijs/oauth-client-deno

A **Deno-compatible** AT Protocol OAuth client that serves as a drop-in replacement for `@atproto/oauth-client-node`.

Built specifically to solve crypto compatibility issues between Node.js-specific AT Protocol OAuth clients and Deno runtime environments. Uses Web Crypto API exclusively for maximum cross-platform compatibility.

> **⚠️ Opinionated Design**: This client uses **Slingshot** as the default handle resolver with fallbacks to other methods. Slingshot is an AT Protocol service that helps with handle resolution and OAuth endpoint discovery. If your use case requires avoiding third-party services or you need complete control over handle resolution, this may not be the right client for you. See [Handle Resolution](#handle-resolution) for alternatives.

## ✨ Key Features

- 🦕 **Deno Native**: Built specifically for Deno using Web Crypto API
- 🔄 **Drop-in Replacement**: Compatible interface with `@atproto/oauth-client-node`
- 🛠️ **Configurable**: Flexible handle resolution, storage backends, and OAuth settings
- 🔒 **Secure DPoP**: Full DPoP (Demonstrating Proof of Possession) implementation
- 🌐 **Multi-Platform**: Works in Deno, browsers, and other Web Crypto environments
- 📦 **Zero Node.js Dependencies**: Pure Web Standards implementation

## 🚀 Installation

```bash
# Using JSR
deno add @tijs/oauth-client-deno

# Or import directly
import { OAuthClient, MemoryStorage } from "jsr:@tijs/oauth-client-deno";
```

## 📖 Quick Start

### Basic Usage

```typescript
import { MemoryStorage, OAuthClient } from "jsr:@tijs/oauth-client-deno";

// Initialize client
const client = new OAuthClient({
  clientId: "https://yourapp.com/client-metadata.json",
  redirectUri: "https://yourapp.com/oauth/callback",
  storage: new MemoryStorage(),
});

// Start OAuth flow
const authUrl = await client.authorize("alice.bsky.social");
console.log("Redirect user to:", authUrl);

// Handle OAuth callback
const { session } = await client.callback({
  code: "authorization_code_from_callback",
  state: "state_parameter_from_callback",
});

// Make authenticated API requests
const response = await session.makeRequest(
  "GET",
  "https://bsky.social/xrpc/com.atproto.repo.listRecords",
);

const data = await response.json();
console.log("User records:", data);
```

### Session Management

```typescript
// Store session for later use
const sessionId = "user-123";
await client.store(sessionId, session);

// Restore session (with automatic token refresh if needed)
const restoredSession = await client.restore(sessionId);
if (restoredSession) {
  console.log("Welcome back,", restoredSession.handle);
}

// Manual token refresh
if (session.isExpired) {
  const refreshedSession = await client.refresh(session);
  await client.store(sessionId, refreshedSession);
}

// Clean logout
await client.signOut(sessionId, session);
```

## 🔧 Configuration Options

### Storage Backends

Choose from built-in storage options or implement your own:

```typescript
// In-memory storage (development)
import { MemoryStorage } from "jsr:@tijs/oauth-client-deno";
const storage = new MemoryStorage();

// SQLite storage (for Deno CLI apps)
import { SQLiteStorage } from "jsr:@tijs/oauth-client-deno";
const storage = new SQLiteStorage(sqlite);

// localStorage (for browsers)
import { LocalStorage } from "jsr:@tijs/oauth-client-deno";
const storage = new LocalStorage();

// Custom storage implementation
const customStorage = {
  async get(key) {/* your logic */},
  async set(key, value, options) {/* your logic */},
  async delete(key) {/* your logic */},
};
```

### Handle Resolution

Configure how AT Protocol handles are resolved to DIDs and PDS URLs. **By default, this client uses Slingshot** (https://slingshot.microcosm.blue) as the primary resolver with automatic fallbacks.

#### Default Behavior (Slingshot-first)

```typescript
import { CustomResolver, DirectoryResolver, SlingshotResolver } from "jsr:@tijs/oauth-client-deno";

// Default: Slingshot with fallbacks to directory and direct resolution
const client = new OAuthClient({
  // ... other config
  // Uses Slingshot resolver automatically with fallbacks
});

// Resolution order:
// 1. Slingshot resolveMiniDoc (https://slingshot.microcosm.blue/xrpc/com.bad-example.identity.resolveMiniDoc)
// 2. Slingshot standard (https://slingshot.microcosm.blue/xrpc/com.atproto.identity.resolveHandle)
// 3. Bluesky API (https://bsky.social/xrpc/com.atproto.identity.resolveHandle)
// 4. Direct handle lookup (https://handle/.well-known/atproto-did)
```

#### Alternative Resolution Strategies

If Slingshot doesn't fit your use case, you can configure alternative resolvers:

```typescript
// Custom Slingshot URL
const client = new OAuthClient({
  // ... other config
  slingshotUrl: "https://my-custom-slingshot.example.com",
});

// Use Bluesky API-first resolution (avoids Slingshot)
const client = new OAuthClient({
  // ... other config
  handleResolver: new DirectoryResolver(), // Only uses bsky.social API
});

// Completely custom resolution logic (full control)
const client = new OAuthClient({
  // ... other config
  handleResolver: new CustomResolver(async (handle) => {
    // Your custom handle resolution logic
    const did = await customResolveHandleToDid(handle);
    const pdsUrl = await customResolvePdsUrl(did);
    return { did, pdsUrl };
  }),
});
```

> **Why Slingshot?** Slingshot is a production-grade cache of AT Protocol data that provides faster handle resolution and better reliability, especially during high-traffic periods. It uses the `resolveMiniDoc` endpoint which returns both DID and PDS URL in a single request, reducing the need for multiple lookups. However, it does introduce a dependency on a third-party service. The fallback mechanisms ensure your application continues to work even if Slingshot is unavailable.

## 🏗️ Advanced Usage

### Error Handling

```typescript
import {
  HandleResolutionError,
  InvalidHandleError,
  OAuthError,
  SessionError,
  TokenExchangeError,
} from "jsr:@tijs/oauth-client-deno";

try {
  const authUrl = await client.authorize("invalid.handle");
} catch (error) {
  if (error instanceof InvalidHandleError) {
    console.error("Handle format is invalid");
  } else if (error instanceof HandleResolutionError) {
    console.error("Could not resolve handle to DID/PDS");
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### Mobile App Integration

The client works seamlessly with mobile WebView implementations:

```typescript
// Mobile-friendly configuration
const client = new OAuthClient({
  clientId: "https://myapp.com/client-metadata.json",
  redirectUri: "myapp://oauth/callback", // Custom URL scheme
  storage: new MemoryStorage(), // or secure storage implementation
});

// Handle custom redirect in mobile app
const { session } = await client.callback(parsedCallbackParams);
```

## 🔍 API Reference

### OAuthClient

Main OAuth client class for AT Protocol authentication.

#### Constructor Options

```typescript
interface OAuthClientConfig {
  clientId: string; // Your OAuth client identifier
  redirectUri: string; // Where users return after auth
  storage: Storage; // Session storage implementation
  handleResolver?: HandleResolver; // Custom handle resolution
  slingshotUrl?: string; // Custom Slingshot URL
}
```

#### Methods

- `authorize(handle: string, options?: AuthorizationUrlOptions): Promise<string>`
- `callback(params: CallbackParams): Promise<{ session: Session }>`
- `store(sessionId: string, session: Session): Promise<void>`
- `restore(sessionId: string): Promise<Session | null>`
- `refresh(session: Session): Promise<Session>`
- `signOut(sessionId: string, session: Session): Promise<void>`

### Session

Authenticated user session with automatic token management.

#### Properties

- `did: string` - User's decentralized identifier
- `handle: string` - User's AT Protocol handle
- `pdsUrl: string` - User's Personal Data Server URL
- `accessToken: string` - Current OAuth access token
- `refreshToken: string` - OAuth refresh token
- `isExpired: boolean` - Whether token needs refresh

#### Methods

- `makeRequest(method: string, url: string, options?): Promise<Response>`
- `toJSON(): SessionData` - Serialize for storage
- `updateTokens(tokens): void` - Update with refreshed tokens

### Storage Interface

Implement this interface for custom storage backends:

```typescript
interface Storage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
```

## 🆚 Differences from @atproto/oauth-client-node

| Feature               | @atproto/oauth-client-node      | @tijs/oauth-client-deno              |
| --------------------- | ------------------------------- | ------------------------------------ |
| **Runtime**           | Node.js only                    | Deno, Browser, Web Standards         |
| **Crypto**            | Node.js crypto APIs             | Web Crypto API (cross-platform)      |
| **Primary Use Case**  | Server-side Node.js apps        | Deno apps, edge workers, browsers    |
| **Dependencies**      | Node.js built-ins + jose        | Web Standards + jose (JSR)           |
| **Handle Resolution** | Configurable resolvers          | Slingshot-first with fallbacks       |
| **Storage**           | Flexible sessionStore interface | Simple Storage interface + built-ins |

> **Note**: Both clients provide full AT Protocol OAuth + DPoP support and maintain API compatibility. The main difference is runtime compatibility - choose based on your deployment environment.

## 🔧 Development

```bash
# Check code
deno check mod.ts

# Format code
deno fmt

# Lint code
deno lint

# Run tests
deno test --allow-net --allow-read
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make changes and add tests
4. Ensure all checks pass: `deno task check && deno task fmt && deno task lint`
5. Commit changes: `git commit -am 'Add my feature'`
6. Push to branch: `git push origin my-feature`
7. Create a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🧩 Why This Package Exists

The official `@atproto/oauth-client-node` package has fundamental compatibility issues with Deno runtime environments. This package was created to solve these specific problems:

### Root Cause Analysis

1. **Node.js-Specific Dependencies**: The official package relies on Node.js-specific crypto dependencies (`@atproto/jwk-jose`, `@atproto/jwk-webcrypto`) that don't work in Deno.

2. **Jose Library Compatibility**: The underlying jose library (when used through Node.js-specific packages) throws `JOSENotSupported: Unsupported key curve for this operation` errors in Deno, specifically when generating ECDSA P-256 keys for DPoP (Demonstrating Proof of Possession) JWT operations.

3. **DPoP Implementation Problem**: AT Protocol OAuth requires DPoP proofs using ES256 signatures with ECDSA P-256 curves. The Node.js crypto implementations in the official client don't translate to Deno's Web Crypto API properly.

### Our Solution

This package solves these issues by:

- **Using Web Crypto API directly** (`crypto.subtle.generateKey`) instead of Node.js crypto
- **JSR-native jose imports** (`jsr:@panva/jose`) instead of Node.js-specific versions
- **Manual ECDSA P-256 key generation** with explicit curve specification (`namedCurve: "P-256"`)
- **Direct DPoP JWT creation** using Web Crypto compatible `SignJWT` operations
- **Cross-platform compatibility** that works in Deno, browsers, and other Web Standards environments

The implementation maintains full API compatibility with the original Node.js client while providing a native Web Standards foundation.

## 🙏 Acknowledgments

- Built to solve compatibility issues with `@atproto/oauth-client-node` in Deno
- Inspired by the AT Protocol OAuth specification and reference implementations
- Inspired by the Bookhive OAuth implementation: https://github.com/nperez0111/bookhive
- Thanks to the Bluesky team for the AT Protocol ecosystem
