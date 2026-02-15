/**
 * @fileoverview Handle resolution and PDS discovery implementations for AT Protocol
 * @module
 */

import { AuthServerDiscoveryError, HandleResolutionError, PDSDiscoveryError } from "./errors.ts";
import type { HandleResolver } from "./types.ts";

/**
 * Slingshot-based handle resolver for AT Protocol.
 *
 * Uses the Slingshot service to resolve handles to DID and PDS URLs. Slingshot
 * provides fast handle resolution with fallback to standard AT Protocol methods.
 * This is the default resolver used by the OAuth client.
 *
 * @example
 * ```ts
 * const resolver = new SlingshotResolver("https://custom-slingshot.com");
 * const { did, pdsUrl } = await resolver.resolve("alice.bsky.social");
 * console.log(`DID: ${did}, PDS: ${pdsUrl}`);
 * ```
 */
export class SlingshotResolver implements HandleResolver {
  /**
   * Create a new Slingshot resolver.
   *
   * @param slingshotUrl - Custom Slingshot service URL (defaults to official instance)
   */
  constructor(private slingshotUrl: string = "https://slingshot.microcosm.blue") {}

  /**
   * Resolve an AT Protocol handle to DID and PDS URL.
   *
   * Uses Slingshot's fast resolution service with fallback to standard AT Protocol
   * methods if Slingshot is unavailable.
   *
   * @param handle - AT Protocol handle to resolve (e.g., "alice.bsky.social")
   * @returns Promise resolving to DID and PDS URL
   * @throws {HandleResolutionError} When handle cannot be resolved
   */
  async resolve(handle: string): Promise<{ did: string; pdsUrl: string }> {
    try {
      return await this.resolveHandleWithSlingshot(handle);
    } catch (_error) {
      // Fallback to other methods if Slingshot fails
      return await this.fallbackResolve(handle);
    }
  }

  private async resolveHandleWithSlingshot(
    handle: string,
  ): Promise<{ did: string; pdsUrl: string }> {
    try {
      // Use Slingshot's resolveMiniDoc endpoint which returns both DID and PDS URL
      const response = await fetch(
        `${this.slingshotUrl}/xrpc/com.bad-example.identity.resolveMiniDoc?identifier=${
          encodeURIComponent(handle)
        }`,
      );

      if (!response.ok) {
        throw new Error(`Slingshot resolver failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.did || !data.pds) {
        throw new Error("Incomplete data in Slingshot response");
      }

      return {
        did: data.did,
        pdsUrl: data.pds,
      };
    } catch (_error) {
      // Fallback to standard AT Protocol endpoint if resolveMiniDoc fails
      const response = await fetch(
        `${this.slingshotUrl}/xrpc/com.atproto.identity.resolveHandle?handle=${
          encodeURIComponent(handle)
        }`,
      );

      if (!response.ok) {
        throw new Error(`Slingshot resolver failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.did) {
        throw new Error("No DID found in Slingshot response");
      }

      // Get PDS URL from DID document
      const pdsUrl = await resolvePdsFromDid(data.did);

      return {
        did: data.did,
        pdsUrl,
      };
    }
  }

  private async fallbackResolve(
    handle: string,
  ): Promise<{ did: string; pdsUrl: string }> {
    // Try multiple resolution methods in order of preference
    const fallbackResolvers = [
      () => this.resolveHandleWithBlueskyAPI(handle),
      () => this.resolveHandleDirectly(handle),
    ];

    for (const resolver of fallbackResolvers) {
      try {
        return await resolver();
      } catch (_error) {
        console.warn(`Fallback resolution method failed:`, _error);
      }
    }

    throw new HandleResolutionError(handle);
  }

  private async resolveHandleWithBlueskyAPI(
    handle: string,
  ): Promise<{ did: string; pdsUrl: string }> {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${
        encodeURIComponent(handle)
      }`,
    );

    if (!response.ok) {
      throw new Error(`Bluesky API resolver failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.did) {
      throw new Error("No DID found in Bluesky API response");
    }

    const pdsUrl = await resolvePdsFromDid(data.did);

    return {
      did: data.did,
      pdsUrl,
    };
  }

  private async resolveHandleDirectly(
    handle: string,
  ): Promise<{ did: string; pdsUrl: string }> {
    if (!handle.includes(".")) {
      throw new Error("Direct resolution requires domain handle");
    }

    try {
      const response = await fetch(`https://${handle}/.well-known/atproto-did`);
      if (!response.ok) {
        throw new Error(`Well-known DID lookup failed: ${response.status}`);
      }

      const did = (await response.text()).trim();
      if (!did.startsWith("did:")) {
        throw new Error("Invalid DID format");
      }

      const pdsUrl = await resolvePdsFromDid(did);

      return {
        did,
        pdsUrl,
      };
    } catch (error) {
      throw new Error(`Direct handle resolution failed: ${error}`);
    }
  }
}

/**
 * AT Protocol Directory handle resolver using Bluesky's API.
 *
 * Uses the official Bluesky API to resolve handles to DID and then looks up
 * the PDS URL from the DID document. This is an alternative to Slingshot
 * that uses standard AT Protocol methods.
 *
 * @example
 * ```ts
 * const resolver = new DirectoryResolver();
 * const { did, pdsUrl } = await resolver.resolve("alice.bsky.social");
 * console.log(`Resolved via Directory: ${did} -> ${pdsUrl}`);
 * ```
 */
export class DirectoryResolver implements HandleResolver {
  /**
   * Resolve an AT Protocol handle to DID and PDS URL using Bluesky API.
   *
   * @param handle - AT Protocol handle to resolve (e.g., "alice.bsky.social")
   * @returns Promise resolving to DID and PDS URL
   * @throws {HandleResolutionError} When handle cannot be resolved
   */
  async resolve(handle: string): Promise<{ did: string; pdsUrl: string }> {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${
        encodeURIComponent(handle)
      }`,
    );

    if (!response.ok) {
      throw new HandleResolutionError(
        handle,
        new Error(`Bluesky API lookup failed: ${response.status}`),
      );
    }

    const data = await response.json();
    if (!data.did) {
      throw new HandleResolutionError(handle, new Error("No DID found in Bluesky API response"));
    }

    const pdsUrl = await resolvePdsFromDid(data.did);

    return {
      did: data.did,
      pdsUrl,
    };
  }
}

/**
 * Custom handle resolver with user-provided resolution function.
 *
 * Allows complete control over handle resolution by providing a custom
 * function. Useful for implementing custom resolution logic, testing,
 * or integrating with alternative handle resolution services.
 *
 * @example
 * ```ts
 * const customResolver = new CustomResolver(async (handle) => {
 *   // Custom resolution logic
 *   const did = await myCustomHandleService.resolve(handle);
 *   const pdsUrl = await myCustomPdsService.getPds(did);
 *   return { did, pdsUrl };
 * });
 *
 * const client = new OAuthClient({
 *   // ... other config
 *   handleResolver: customResolver,
 * });
 * ```
 */
export class CustomResolver implements HandleResolver {
  /**
   * Create a custom resolver with provided resolution function.
   *
   * @param resolverFunction - Function that resolves handles to DID and PDS URL
   */
  constructor(
    private resolverFunction: (handle: string) => Promise<{ did: string; pdsUrl: string }>,
  ) {}

  /**
   * Resolve handle using the provided custom function.
   *
   * @param handle - AT Protocol handle to resolve
   * @returns Promise resolving to DID and PDS URL
   * @throws {HandleResolutionError} When custom resolver function fails
   */
  async resolve(handle: string): Promise<{ did: string; pdsUrl: string }> {
    try {
      return await this.resolverFunction(handle);
    } catch (error) {
      throw new HandleResolutionError(handle, error as Error);
    }
  }
}

/**
 * Create the default handle resolver with optional custom Slingshot URL.
 *
 * Returns a {@link SlingshotResolver} configured with the specified Slingshot
 * service URL. This is the recommended resolver for most applications.
 *
 * @param slingshotUrl - Optional custom Slingshot service URL
 * @returns Configured Slingshot resolver instance
 * @example
 * ```ts
 * // Use default Slingshot instance
 * const resolver = createDefaultResolver();
 *
 * // Use custom Slingshot instance
 * const customResolver = createDefaultResolver("https://my-slingshot.example.com");
 * ```
 */
export function createDefaultResolver(slingshotUrl?: string): HandleResolver {
  return new SlingshotResolver(slingshotUrl);
}

/**
 * Resolve PDS URL from DID by fetching DID document
 */
async function resolvePdsFromDid(did: string): Promise<string> {
  const result = await resolveDidDocument(did);
  return result.pdsUrl;
}

/**
 * Resolve DID document to extract PDS URL and handle.
 *
 * Fetches the DID document from PLC directory and extracts the PDS service
 * endpoint and handle from alsoKnownAs. Used during auth server URL flows
 * to populate session data after the token exchange.
 *
 * @param did - DID to resolve (e.g., "did:plc:...")
 * @returns Promise resolving to PDS URL and handle
 * @throws {PDSDiscoveryError} When DID document cannot be fetched or parsed
 */
export async function resolveDidDocument(
  did: string,
): Promise<{ pdsUrl: string; handle: string }> {
  try {
    const response = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);

    if (!response.ok) {
      throw new Error(`PLC directory lookup failed: ${response.status}`);
    }

    const didDocument = await response.json();

    // Look for AT Protocol service in DID document
    const service = didDocument.service?.find((
      s: { type?: string; id?: string; serviceEndpoint?: unknown },
    ) =>
      s.type === "AtprotoPersonalDataServer" ||
      s.id === "#atproto_pds"
    );

    if (!service?.serviceEndpoint) {
      throw new Error("No AT Protocol PDS service found in DID document");
    }

    let pdsUrl = service.serviceEndpoint;
    if (typeof pdsUrl !== "string") {
      throw new Error("Invalid PDS service endpoint format");
    }

    // Clean up PDS URL
    pdsUrl = pdsUrl.replace(/\/$/, "");

    // Extract handle from alsoKnownAs
    let handle = did;
    if (Array.isArray(didDocument.alsoKnownAs)) {
      const atUri = didDocument.alsoKnownAs.find((uri: string) => uri.startsWith("at://"));
      if (atUri) {
        handle = atUri.replace("at://", "");
      }
    }

    return { pdsUrl, handle };
  } catch (error) {
    throw new PDSDiscoveryError(did, error as Error);
  }
}

/**
 * Discover OAuth authentication server URL from PDS metadata.
 *
 * Fetches the OAuth protected resource metadata from the PDS to determine
 * the authentication server URL. This is used for custom domain setups
 * where the OAuth server may be separate from the PDS.
 *
 * @param pdsUrl - The PDS URL to query for OAuth metadata
 * @returns Promise resolving to the authentication server URL
 * @throws {AuthServerDiscoveryError} When authentication server cannot be discovered
 * @example
 * ```ts
 * const authServer = await discoverAuthenticationServer("https://custom-pds.example.com");
 * console.log("Auth server:", authServer); // "https://oauth.example.com"
 * ```
 */
export async function discoverAuthenticationServer(
  pdsUrl: string,
): Promise<string> {
  try {
    const response = await fetch(`${pdsUrl}/.well-known/oauth-protected-resource`);

    if (!response.ok) {
      throw new Error(`PDS OAuth metadata discovery failed: ${response.status}`);
    }

    const metadata = await response.json();

    // The authorization_servers field contains potential authentication servers
    if (metadata.authorization_servers && metadata.authorization_servers.length > 0) {
      // Use the first authorization server
      return metadata.authorization_servers[0];
    }

    // Fallback: assume PDS is the auth server
    console.warn(
      `No authorization servers found in PDS metadata for ${pdsUrl}, using PDS as auth server`,
    );
    return pdsUrl;
  } catch (error) {
    throw new AuthServerDiscoveryError(pdsUrl, error as Error);
  }
}

/**
 * Discover OAuth endpoints from an authentication server.
 *
 * Fetches the OAuth authorization server metadata to get the endpoints
 * needed for the OAuth flow (authorization, token, and optionally revocation).
 *
 * @param authServerUrl - The authentication server URL
 * @returns Promise resolving to OAuth endpoints
 * @throws {PDSDiscoveryError} When OAuth endpoints cannot be discovered
 * @example
 * ```ts
 * const endpoints = await discoverOAuthEndpointsFromAuthServer("https://oauth.example.com");
 * console.log("Auth endpoint:", endpoints.authorizationEndpoint);
 * console.log("Token endpoint:", endpoints.tokenEndpoint);
 * ```
 */
export async function discoverOAuthEndpointsFromAuthServer(
  authServerUrl: string,
): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
}> {
  try {
    const response = await fetch(
      `${authServerUrl}/.well-known/oauth-authorization-server`,
    );

    if (!response.ok) {
      throw new Error(`OAuth discovery failed: ${response.status}`);
    }

    const endpoints = await response.json();

    if (!endpoints.authorization_endpoint || !endpoints.token_endpoint) {
      throw new Error("Missing required OAuth endpoints in discovery document");
    }

    return {
      authorizationEndpoint: endpoints.authorization_endpoint,
      tokenEndpoint: endpoints.token_endpoint,
      revocationEndpoint: endpoints.revocation_endpoint,
    };
  } catch (error) {
    throw new AuthServerDiscoveryError(authServerUrl, error as Error);
  }
}

/**
 * Discover OAuth endpoints from a PDS (complete discovery flow).
 *
 * Performs the complete OAuth endpoint discovery process by first discovering
 * the authentication server from the PDS, then fetching the OAuth endpoints
 * from that server. This is the main function used during OAuth authorization.
 *
 * @param pdsUrl - The PDS URL to discover OAuth endpoints for
 * @returns Promise resolving to OAuth endpoints
 * @throws {PDSDiscoveryError} When OAuth endpoints cannot be discovered
 * @example
 * ```ts
 * const endpoints = await discoverOAuthEndpointsFromPDS("https://bsky.social");
 * console.log("Authorization URL:", endpoints.authorizationEndpoint);
 * console.log("Token endpoint:", endpoints.tokenEndpoint);
 * ```
 */
export async function discoverOAuthEndpointsFromPDS(
  pdsUrl: string,
): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
}> {
  try {
    // Step 1: Try to discover authentication server from PDS
    const authServer = await discoverAuthenticationServer(pdsUrl);

    // Step 2: Discover OAuth endpoints from authentication server
    return await discoverOAuthEndpointsFromAuthServer(authServer);
  } catch (authServerError) {
    // If auth server discovery fails, try using PDS directly as fallback
    try {
      console.warn(
        `Auth server discovery failed for ${pdsUrl}, trying PDS directly:`,
        authServerError,
      );
      return await discoverOAuthEndpointsFromAuthServer(pdsUrl);
    } catch (pdsError) {
      throw new PDSDiscoveryError(pdsUrl, pdsError as Error);
    }
  }
}
