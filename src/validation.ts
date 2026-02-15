/**
 * @fileoverview Validation utilities for OAuth metadata and token responses
 * @module
 */

import { MetadataValidationError, TokenValidationError } from "./errors.ts";

/**
 * Validated authorization server metadata with required fields guaranteed present.
 */
export interface ValidatedAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  pushed_authorization_request_endpoint?: string | undefined;
  revocation_endpoint?: string | undefined;
  dpop_signing_alg_values_supported?: string[] | undefined;
}

/**
 * Validated token response with required fields guaranteed present.
 */
export interface ValidatedTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  sub: string;
  expires_in: number;
  refresh_token?: string | undefined;
}

/**
 * Validate that a URL uses the HTTPS scheme.
 *
 * @param url - URL string to validate
 * @param label - Human-readable label for error messages
 * @throws {MetadataValidationError} When URL is not HTTPS
 */
export function requireHttpsUrl(url: string, label: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new MetadataValidationError(
        `${label} must use HTTPS, got ${parsed.protocol} (${url})`,
      );
    }
  } catch (error) {
    if (error instanceof MetadataValidationError) throw error;
    throw new MetadataValidationError(`${label} is not a valid URL: ${url}`);
  }
}

/**
 * Validate authorization server metadata per the AT Protocol OAuth spec.
 *
 * Checks:
 * - Response is an object with required fields
 * - `issuer` matches the expected URL (origin comparison)
 * - `authorization_endpoint` and `token_endpoint` are present and HTTPS
 * - `dpop_signing_alg_values_supported` includes "ES256" (if present)
 *
 * @param metadata - Raw metadata response from the auth server
 * @param expectedIssuer - The URL the metadata was fetched from
 * @returns Validated metadata with typed fields
 * @throws {MetadataValidationError} When metadata is invalid
 */
export function validateAuthServerMetadata(
  metadata: unknown,
  expectedIssuer: string,
): ValidatedAuthServerMetadata {
  if (!metadata || typeof metadata !== "object") {
    throw new MetadataValidationError("metadata is not an object");
  }

  const md = metadata as Record<string, unknown>;

  // Validate issuer
  if (typeof md.issuer !== "string" || !md.issuer) {
    throw new MetadataValidationError("missing or invalid 'issuer' field");
  }

  // Issuer must match the expected URL (origin comparison)
  const issuerOrigin = new URL(md.issuer).origin;
  const expectedOrigin = new URL(expectedIssuer).origin;
  if (issuerOrigin !== expectedOrigin) {
    throw new MetadataValidationError(
      `issuer origin "${issuerOrigin}" does not match expected "${expectedOrigin}"`,
    );
  }

  // Validate required endpoints
  if (typeof md.authorization_endpoint !== "string" || !md.authorization_endpoint) {
    throw new MetadataValidationError("missing 'authorization_endpoint'");
  }
  requireHttpsUrl(md.authorization_endpoint, "authorization_endpoint");

  if (typeof md.token_endpoint !== "string" || !md.token_endpoint) {
    throw new MetadataValidationError("missing 'token_endpoint'");
  }
  requireHttpsUrl(md.token_endpoint, "token_endpoint");

  // Validate optional endpoints that must be HTTPS if present
  if (md.pushed_authorization_request_endpoint) {
    if (typeof md.pushed_authorization_request_endpoint !== "string") {
      throw new MetadataValidationError(
        "invalid 'pushed_authorization_request_endpoint'",
      );
    }
    requireHttpsUrl(
      md.pushed_authorization_request_endpoint,
      "pushed_authorization_request_endpoint",
    );
  }

  if (md.revocation_endpoint) {
    if (typeof md.revocation_endpoint !== "string") {
      throw new MetadataValidationError("invalid 'revocation_endpoint'");
    }
    requireHttpsUrl(md.revocation_endpoint, "revocation_endpoint");
  }

  // Validate DPoP signing algorithms if specified
  if (md.dpop_signing_alg_values_supported !== undefined) {
    if (!Array.isArray(md.dpop_signing_alg_values_supported)) {
      throw new MetadataValidationError(
        "'dpop_signing_alg_values_supported' must be an array",
      );
    }
    if (!md.dpop_signing_alg_values_supported.includes("ES256")) {
      throw new MetadataValidationError(
        "server does not support ES256 for DPoP (required by AT Protocol)",
      );
    }
  }

  return {
    issuer: md.issuer,
    authorization_endpoint: md.authorization_endpoint,
    token_endpoint: md.token_endpoint,
    pushed_authorization_request_endpoint: md
      .pushed_authorization_request_endpoint as string | undefined,
    revocation_endpoint: md.revocation_endpoint as string | undefined,
    dpop_signing_alg_values_supported: md.dpop_signing_alg_values_supported as
      | string[]
      | undefined,
  };
}

/**
 * Validate a token response from the authorization server.
 *
 * Checks:
 * - `access_token` is a non-empty string
 * - `token_type` is "DPoP" (case-insensitive)
 * - `scope` exists and contains "atproto"
 * - `sub` is present and starts with "did:"
 * - `expires_in` is a positive number
 * - `refresh_token` is a string if present
 *
 * @param response - Raw token response JSON
 * @returns Validated token response with typed fields
 * @throws {TokenValidationError} When token response is invalid
 */
export function validateTokenResponse(
  response: unknown,
): ValidatedTokenResponse {
  if (!response || typeof response !== "object") {
    throw new TokenValidationError("token response is not an object");
  }

  const r = response as Record<string, unknown>;

  if (typeof r.access_token !== "string" || !r.access_token) {
    throw new TokenValidationError("missing or empty 'access_token'");
  }

  if (typeof r.token_type !== "string") {
    throw new TokenValidationError("missing 'token_type'");
  }
  if (r.token_type.toLowerCase() !== "dpop") {
    throw new TokenValidationError(
      `unexpected token_type "${r.token_type}", expected "DPoP"`,
    );
  }

  if (typeof r.sub !== "string" || !r.sub) {
    throw new TokenValidationError("missing 'sub' claim");
  }
  if (!r.sub.startsWith("did:")) {
    throw new TokenValidationError(
      `invalid 'sub' claim "${r.sub}", must start with "did:"`,
    );
  }

  if (typeof r.scope !== "string" || !r.scope) {
    throw new TokenValidationError("missing 'scope'");
  }
  if (!r.scope.includes("atproto")) {
    throw new TokenValidationError(
      `scope "${r.scope}" does not include required "atproto" scope`,
    );
  }

  if (typeof r.expires_in !== "number" || r.expires_in <= 0) {
    throw new TokenValidationError(
      `invalid 'expires_in' value: ${r.expires_in}`,
    );
  }

  if (r.refresh_token !== undefined && typeof r.refresh_token !== "string") {
    throw new TokenValidationError("'refresh_token' must be a string if present");
  }

  return {
    access_token: r.access_token,
    token_type: r.token_type,
    scope: r.scope,
    sub: r.sub,
    expires_in: r.expires_in,
    refresh_token: r.refresh_token as string | undefined,
  };
}
