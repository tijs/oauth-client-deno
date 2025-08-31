/**
 * Default and configurable resolvers for AT Protocol handle resolution and PDS discovery
 */

import { AuthServerDiscoveryError, HandleResolutionError, PDSDiscoveryError } from "./errors.ts";
import type { HandleResolver } from "./types.ts";

/**
 * Default Slingshot-based handle resolver
 */
export class SlingshotResolver implements HandleResolver {
  constructor(private slingshotUrl: string = "https://slingshot.microcosm.blue") {}

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
 * Bluesky API-first handle resolver (alternative to Slingshot)
 */
export class DirectoryResolver implements HandleResolver {
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
 * Custom resolver that allows complete control over handle resolution
 */
export class CustomResolver implements HandleResolver {
  constructor(
    private resolverFunction: (handle: string) => Promise<{ did: string; pdsUrl: string }>,
  ) {}

  async resolve(handle: string): Promise<{ did: string; pdsUrl: string }> {
    try {
      return await this.resolverFunction(handle);
    } catch (error) {
      throw new HandleResolutionError(handle, error as Error);
    }
  }
}

/**
 * Create default handle resolver with optional custom Slingshot URL
 */
export function createDefaultResolver(slingshotUrl?: string): HandleResolver {
  return new SlingshotResolver(slingshotUrl);
}

/**
 * Resolve PDS URL from DID by fetching DID document
 */
async function resolvePdsFromDid(did: string): Promise<string> {
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
    pdsUrl = pdsUrl.replace(/\/$/, ""); // Remove trailing slash

    return pdsUrl;
  } catch (error) {
    throw new PDSDiscoveryError(did, error as Error);
  }
}

/**
 * Discover authentication server from PDS metadata
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
    // For now, gracefully fallback but in the future we might want to throw
    // throw new AuthServerDiscoveryError(pdsUrl, error as Error);

    // Fallback: assume PDS is the auth server
    console.warn(`Failed to discover auth server from ${pdsUrl}, using PDS as auth server:`, error);
    return pdsUrl;
  }
}

/**
 * Discover OAuth endpoints from an authentication server
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
 * Discover OAuth endpoints from a PDS (complete flow)
 */
export async function discoverOAuthEndpointsFromPDS(
  pdsUrl: string,
): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint?: string;
}> {
  try {
    // Step 1: Discover authentication server from PDS
    const authServer = await discoverAuthenticationServer(pdsUrl);

    // Step 2: Discover OAuth endpoints from authentication server
    return await discoverOAuthEndpointsFromAuthServer(authServer);
  } catch (error) {
    throw new PDSDiscoveryError(pdsUrl, error as Error);
  }
}
