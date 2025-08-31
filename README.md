# @tijs/oauth-client-deno

A **Deno-compatible** AT Protocol OAuth client that serves as a drop-in replacement for `@atproto/oauth-client-node`.

Built specifically to solve crypto compatibility issues between Node.js-specific AT Protocol OAuth clients and Deno runtime environments. Uses Web Crypto API exclusively for maximum cross-platform compatibility.

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

Configure how AT Protocol handles are resolved to DIDs and PDS URLs:

```typescript
import {
  CustomResolver,
  DirectoryResolver,
  SlingshotResolver,
} from "jsr:@tijs/oauth-client-deno";

// Default: Slingshot with fallbacks
const client = new OAuthClient({
  // ... other config
  // Uses default Slingshot resolver automatically
});

// Custom Slingshot URL
const client = new OAuthClient({
  // ... other config
  slingshotUrl: "https://my-custom-slingshot.example.com",
});

// Use directory-first resolution
const client = new OAuthClient({
  // ... other config
  handleResolver: new DirectoryResolver(),
});

// Completely custom resolution logic
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

| Feature               | @atproto/oauth-client-node      | @tijs/oauth-client-deno                 |
| --------------------- | ------------------------------- | --------------------------------------- |
| **Runtime**           | Node.js only                    | Deno, Browser, Web Standards            |
| **Crypto**            | Node.js crypto + jose           | Web Crypto API + jose                   |
| **DPoP**              | Node.js-specific implementation | Cross-platform Web Crypto               |
| **Handle Resolution** | Fixed resolver                  | Configurable with multiple options      |
| **Storage**           | Custom sessionStore interface   | Storage interface with built-in options |
| **Import**            | CommonJS/ESM                    | ESM only                                |
| **Dependencies**      | Node.js built-ins               | Zero Node.js dependencies               |

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

## 🙏 Acknowledgments

- Built to solve compatibility issues with `@atproto/oauth-client-node` in Deno
- Inspired by the AT Protocol OAuth specification and reference implementations
- Thanks to the Bluesky team for the AT Protocol ecosystem

---

**Note**: This package was created specifically to address the "Unsupported key curve" errors encountered when using the official AT Protocol OAuth client in Deno environments. It maintains API compatibility while providing a native Deno implementation using Web Crypto APIs.
